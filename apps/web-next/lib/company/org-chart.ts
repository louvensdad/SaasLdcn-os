import type {
  AgentExecutionView, CompanyJobView, CompanyTeam, JobAssignment, TeamPosition, VirtualCompanyView,
} from '@contracts/company.contract';

import type { GraphEdge, GraphNode } from '@/components/canvas/geometry';
import type { Family } from '@/components/signal';
import type { CognitiveRun } from '@/lib/api/types';
import { familyFor } from '@/lib/status';

/**
 * The company of a mission as an org chart: teams are zones, seats are cards, reporting lines come from
 * `reports_to_position_id` and hand-offs from job dependencies that cross two agents. Nothing is drawn that the
 * company, its jobs and its executions do not record.
 */
export interface SeatData {
  readonly kind: 'seat';
  readonly position: TeamPosition;
  readonly team: CompanyTeam;
  /** Why nobody holds the seat, when the router refused to staff it. */
  readonly refusal: JobAssignment | null;
  /** The latest cognitive certification run of the seat's role, if one was ever recorded. */
  readonly run: CognitiveRun | null;
  readonly family: Family;
}

export interface ZoneData {
  readonly kind: 'zone';
  readonly team: CompanyTeam;
}

export type OrgNodeData = SeatData | ZoneData;

const COLUMN = 290;
const CARD_W = 250;
const CARD_H = 76;
const ROW = 108;
const HEAD = 78;
const INDENT = 24;

export const ROLE_GLYPHS = ['orchestrator', 'architect', 'backend', 'frontend', 'qa', 'security', 'reviewer', 'database', 'devops', 'generic'] as const;
export type RoleGlyph = (typeof ROLE_GLYPHS)[number];

/** A glyph for a role definition, by the words in its id. It only picks a drawing: the id itself is always shown. */
export function roleGlyph(definitionId: string): RoleGlyph {
  const id = definitionId.toLowerCase();
  if (/review/.test(id)) return 'reviewer';
  if (/secur/.test(id)) return 'security';
  if (/(^|_)(qa|test)/.test(id)) return 'qa';
  if (/front|ui_|mobile/.test(id)) return 'frontend';
  if (/data|database|dba|warehouse/.test(id)) return 'database';
  if (/devops|infra|platform|sre/.test(id)) return 'devops';
  if (/architect/.test(id)) return 'architect';
  if (/cto|chief|orchestr|lead|manager/.test(id)) return 'orchestrator';
  if (/back|api|service/.test(id)) return 'backend';
  return 'generic';
}

export function seatFamily(position: TeamPosition, refusal: JobAssignment | null): Family {
  if (position.member) return familyFor(position.member.certification);
  return refusal ? 'fault' : 'idle';
}

export function layoutOrgChart({ company, assignments, jobs, executions, runs, seatLabel }: {
  readonly company: VirtualCompanyView;
  readonly assignments: readonly JobAssignment[];
  readonly jobs: readonly CompanyJobView[];
  readonly executions: readonly AgentExecutionView[];
  readonly runs: readonly CognitiveRun[];
  readonly seatLabel: (seat: SeatData) => string;
}): { readonly nodes: readonly GraphNode<OrgNodeData>[]; readonly edges: readonly GraphEdge[] } {
  const nodes: GraphNode<OrgNodeData>[] = [];
  const edges: GraphEdge[] = [];
  const positionTeam = new Map<string, string>();
  company.teams.forEach((team) => team.positions.forEach((position) => positionTeam.set(position.position_id, team.team_id)));

  company.teams.forEach((team, column) => {
    const x = column * COLUMN;
    const ids = new Set(team.positions.map((position) => position.position_id));
    const children = new Map<string, TeamPosition[]>();
    const roots: TeamPosition[] = [];
    for (const position of team.positions) {
      const parent = position.reports_to_position_id;
      if (parent && ids.has(parent)) children.set(parent, [...(children.get(parent) ?? []), position]);
      else roots.push(position);
    }
    const ordered: { readonly position: TeamPosition; readonly depth: number }[] = [];
    const visit = (position: TeamPosition, depth: number) => {
      ordered.push({ position, depth });
      for (const child of children.get(position.position_id) ?? []) visit(child, depth + 1);
    };
    roots.forEach((root) => visit(root, 0));

    nodes.push({
      id: `zone:${team.team_id}`, x: x - 12, y: -12, w: CARD_W + 24, h: HEAD + Math.max(0, ordered.length - 1) * ROW + CARD_H + 24,
      data: { kind: 'zone', team },
    });
    ordered.forEach(({ position, depth }, row) => {
      const refusal = position.member ? null : assignments.find((entry) => entry.role === position.definition_id && entry.refusal_code) ?? null;
      const run = runs.find((entry) => entry.roleId === position.definition_id) ?? null;
      const seat: SeatData = { kind: 'seat', position, team, refusal, run, family: seatFamily(position, refusal) };
      const indent = Math.min(depth, 3) * INDENT;
      nodes.push({
        id: position.position_id, x: x + indent, y: HEAD + row * ROW, w: CARD_W - indent, h: CARD_H,
        label: seatLabel(seat), data: seat,
      });
    });
  });

  for (const team of company.teams) {
    for (const position of team.positions) {
      const parent = position.reports_to_position_id;
      if (!parent || !positionTeam.has(parent)) continue;
      const sameTeam = positionTeam.get(parent) === team.team_id;
      edges.push({ from: parent, to: position.position_id, className: 'e-reports', orient: sameTeam ? 'v' : 'auto', arrow: false });
    }
  }

  /* A hand-off is one job waiting on another whose executions were run by a different agent. */
  const agentOf = (job: CompanyJobView) => executions.find((execution) => execution.blueprint_ref === job.blueprint_ref && execution.agent_instance_id)?.agent_instance_id ?? null;
  const seatOf = new Map<string, string>();
  company.teams.forEach((team) => team.positions.forEach((position) => {
    if (position.member) seatOf.set(position.member.instance_id, position.position_id);
  }));
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const seen = new Set<string>();
  for (const job of jobs) {
    const to = seatOf.get(agentOf(job) ?? '');
    if (!to) continue;
    for (const dependencyId of job.dependency_job_ids ?? []) {
      const dependency = byId.get(dependencyId);
      const from = dependency ? seatOf.get(agentOf(dependency) ?? '') : undefined;
      if (!dependency || !from || from === to) continue;
      const key = `${from}>${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from, to, className: 'e-handoff', label: dependency.blueprint_ref });
    }
  }

  return { nodes, edges };
}

/** The recorded axes of a cognitive run, in a stable order, each with the family of its own status. */
export function runAxes(run: CognitiveRun | null): readonly { readonly axis: string; readonly status: string; readonly family: Family }[] {
  if (!run) return [];
  return Object.entries(run.axes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([axis, value]) => ({ axis, status: value.status, family: familyFor(value.status) }));
}
