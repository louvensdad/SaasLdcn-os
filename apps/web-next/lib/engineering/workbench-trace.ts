import type { AgentExecutionView, CompanyJobView, ImplementationPlanView } from '@contracts/company.contract';
import type { GenerationArtifact, ResilientGenerationJob } from '@contracts/generation-job.contract';
import type { TestRoomSessionView } from '@contracts/test-room.contract';

import type { GraphEdge, GraphNode } from '@/components/canvas/geometry';
import type { Family } from '@/components/signal';
import { GATE_FAMILY } from '@/lib/runtime/runtime-chain';
import { familyFor } from '@/lib/status';

/**
 * Why this code exists and what proves it, joined only through fields the backend serves:
 * requirement (`plan.blueprints[].requirement_refs`) → unit of work (`ref`) → agent (executions by `blueprint_ref`)
 * → stage it ran in (`execution.stage`) → files written during that stage (`job.artifacts[].stage`) → build
 * (`job.buildStatus`) → Test Room gates. The agent → file link is never claimed: files hang from the stage.
 */
export type WorkbenchColumn = 'requirement' | 'unit' | 'agent' | 'stage' | 'files' | 'build' | 'tests';
export const WORKBENCH_COLUMNS: readonly WorkbenchColumn[] = ['requirement', 'unit', 'agent', 'stage', 'files', 'build', 'tests'];

export interface WorkbenchItem {
  readonly kind: 'item';
  readonly column: WorkbenchColumn;
  readonly title: string;
  readonly state: string;
  readonly family: Family;
  /** Files of a stage, when the item is a folded group. */
  readonly files?: readonly GenerationArtifact[];
}

export interface WorkbenchHead {
  readonly kind: 'head';
  readonly column: WorkbenchColumn;
}

export type WorkbenchData = WorkbenchItem | WorkbenchHead;

const X: Readonly<Record<WorkbenchColumn, number>> = { requirement: 0, unit: 250, agent: 500, stage: 750, files: 960, build: 1220, tests: 1420 };
const W: Readonly<Record<WorkbenchColumn, number>> = { requirement: 210, unit: 210, agent: 210, stage: 170, files: 220, build: 160, tests: 180 };
const H = 56;
const FILE_H = 48;
const GAP = 12;

export function layoutWorkbenchTrace({ plan, jobs, executions, job, session, expanded, words }: {
  readonly plan: ImplementationPlanView;
  readonly jobs: readonly CompanyJobView[];
  readonly executions: readonly AgentExecutionView[];
  readonly job: ResilientGenerationJob | null;
  readonly session: TestRoomSessionView | null;
  /** Stages whose files are unfolded one by one. */
  readonly expanded: ReadonlySet<string>;
  readonly words: { readonly files: (count: number) => string; readonly toggle: (stage: string, open: boolean) => string; readonly build: string; readonly tests: string };
}): { readonly nodes: readonly GraphNode<WorkbenchData>[]; readonly edges: readonly GraphEdge[] } {
  const nodes: GraphNode<WorkbenchData>[] = [];
  const edges: GraphEdge[] = [];
  const columns = new Map<WorkbenchColumn, GraphNode<WorkbenchData>[]>();
  const add = (column: WorkbenchColumn, node: Omit<GraphNode<WorkbenchData>, 'x' | 'y'> & { readonly h: number }) =>
    columns.set(column, [...(columns.get(column) ?? []), { ...node, x: X[column], y: 0 }]);
  const edge = (from: string, to: string, family: Family, orient: 'h' | 'v' = 'h') => {
    if (edges.some((entry) => entry.from === from && entry.to === to)) return;
    edges.push({ from, to, orient, className: family === 'proof' ? 'e-proof' : family === 'fault' ? 'e-blocked' : family === 'pulse' ? 'e-live' : family === 'caution' ? 'e-caution' : 'e-declared', arrow: false });
  };

  const statusOf = (ref: string) => jobs.find((entry) => entry.blueprint_ref === ref)?.status ?? null;
  const requirements = [...new Set(plan.blueprints.flatMap((blueprint) => blueprint.requirement_refs))];
  requirements.forEach((ref) => add('requirement', { id: `req:${ref}`, w: W.requirement, h: H, label: ref, data: { kind: 'item', column: 'requirement', title: ref, state: 'requirement_ref', family: 'idle' } }));

  for (const blueprint of plan.blueprints) {
    const status = statusOf(blueprint.ref) ?? blueprint.status;
    const family = status === 'READY' ? 'proof' : status === 'REFUSED' ? 'fault' : status === 'BLOCKED' ? 'caution' : familyFor(status);
    add('unit', { id: `unit:${blueprint.ref}`, w: W.unit, h: H, label: `${blueprint.ref}: ${status}`, data: { kind: 'item', column: 'unit', title: blueprint.ref, state: status, family } });
    blueprint.requirement_refs.forEach((ref) => edge(`req:${ref}`, `unit:${blueprint.ref}`, family));
  }

  const agents = new Map<string, AgentExecutionView[]>();
  for (const execution of executions) {
    if (!execution.blueprint_ref || !plan.blueprints.some((blueprint) => blueprint.ref === execution.blueprint_ref)) continue;
    const key = execution.agent_instance_id ?? execution.role;
    agents.set(key, [...(agents.get(key) ?? []), execution]);
  }
  for (const [key, runs] of agents) {
    const last = runs[runs.length - 1]!;
    const family = familyFor(last.status);
    add('agent', { id: `agent:${key}`, w: W.agent, h: H, label: `${last.role}: ${last.status}`, data: { kind: 'item', column: 'agent', title: last.role, state: last.status, family } });
    for (const run of runs) {
      edge(`unit:${run.blueprint_ref}`, `agent:${key}`, familyFor(run.status));
    }
  }

  const stages = [...new Set([...agents.values()].flat().map((run) => run.stage))];
  const artifacts = job?.artifacts ?? [];
  for (const stage of stages) {
    const status = job?.stageStatuses?.[stage] ?? null;
    const family: Family = status === 'success' ? 'proof' : status === 'failed' ? 'fault' : status === 'running' ? 'pulse' : status ? 'idle' : 'unknown';
    add('stage', { id: `stage:${stage}`, w: W.stage, h: H, label: `${stage}: ${status ?? 'unknown'}`, data: { kind: 'item', column: 'stage', title: stage, state: status ?? 'unknown', family } });
    for (const [key, runs] of agents) {
      if (runs.some((run) => run.stage === stage)) edge(`agent:${key}`, `stage:${stage}`, family);
    }
    const written = artifacts.filter((artifact) => artifact.stage === stage);
    if (written.length === 0) continue;
    const open = expanded.has(stage);
    const invalid = written.some((artifact) => !artifact.valid);
    const groupFamily: Family = invalid ? 'caution' : 'proof';
    const groupId = `files:${stage}`;
    columns.set('files', [...(columns.get('files') ?? []), {
      id: groupId, x: X.files, y: 0, w: W.files, h: H, label: `${words.files(written.length)} · ${stage}`,
      toggle: { expanded: open, label: words.toggle(stage, open) },
      data: { kind: 'item', column: 'files', title: words.files(written.length), state: stage, family: groupFamily, files: written },
    }]);
    edge(`stage:${stage}`, groupId, groupFamily);
    if (open) {
      let previous = groupId;
      written.forEach((artifact) => {
        const fileId = `file:${artifact.id}`;
        columns.set('files', [...(columns.get('files') ?? []), {
          id: fileId, x: X.files + 16, y: 0, w: W.files - 16, h: FILE_H, label: `${artifact.path}: valid: ${String(artifact.valid)}`,
          data: { kind: 'item', column: 'files', title: artifact.path, state: artifact.kind, family: artifact.valid ? 'proof' : 'caution' },
        }]);
        /* Files hang below their group as a chain in the same column: the line drops, it never loops back. */
        edge(previous, fileId, artifact.valid ? 'proof' : 'caution', 'v');
        previous = fileId;
      });
    }
  }

  const buildStatus = job?.buildStatus ?? null;
  const buildFamily: Family = !buildStatus ? 'unknown' : buildStatus === 'RUNNING' ? 'pulse' : familyFor(buildStatus);
  add('build', { id: 'build', w: W.build, h: H, label: `${words.build}: ${buildStatus ?? 'unknown'}`, data: { kind: 'item', column: 'build', title: words.build, state: buildStatus ?? 'unknown', family: buildFamily } });
  for (const node of columns.get('files') ?? []) {
    if (node.id.startsWith('files:')) edge(node.id, 'build', buildFamily);
  }

  for (const gate of session?.gates ?? []) {
    const family = GATE_FAMILY[gate.status] ?? familyFor(gate.status);
    add('tests', { id: `gate:${gate.gate}`, w: W.tests, h: H, label: `${gate.label}: ${gate.status}`, data: { kind: 'item', column: 'tests', title: gate.label, state: gate.status, family } });
    edge('build', `gate:${gate.gate}`, family);
  }
  if (!session) {
    add('tests', { id: 'gate:none', w: W.tests, h: H, label: `${words.tests}: NOT_RUN`, data: { kind: 'item', column: 'tests', title: words.tests, state: 'NOT_RUN', family: 'idle' } });
    edge('build', 'gate:none', 'idle');
  }

  const heights = WORKBENCH_COLUMNS.map((column) => (columns.get(column) ?? []).reduce((sum, node) => sum + node.h + GAP, -GAP));
  const tallest = Math.max(0, ...heights);
  WORKBENCH_COLUMNS.forEach((column, index) => {
    let y = (tallest - Math.max(0, heights[index]!)) / 2;
    for (const node of columns.get(column) ?? []) {
      nodes.push({ ...node, y });
      y += node.h + GAP;
    }
    nodes.push({ id: `head:${column}`, x: X[column], y: -44, w: W[column], h: 22, data: { kind: 'head', column } });
  });
  return { nodes, edges };
}
