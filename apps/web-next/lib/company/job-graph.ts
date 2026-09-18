import type { AgentExecutionView, CompanyJobView, ImplementationPlanView } from '@contracts/company.contract';

import type { GraphEdge, GraphNode } from '@/components/canvas/geometry';
import type { Family } from '@/components/signal';
import { familyFor } from '@/lib/status';

/**
 * The company's units of work as a graph: one column per `depth` (served), an arrow from each dependency
 * (`dependency_job_ids`, resolved by the backend) to the job that waits on it, and the plan's `critical_path` — the
 * longest dependency chain the planner computed — drawn in platinum. Nothing here is re-derived from titles.
 */

/** REFUSED is the platform saying nobody can do this work; BLOCKED is only "not yet". They never render the same. */
export const JOB_FAMILY: Readonly<Record<string, Family>> = { READY: 'proof', BLOCKED: 'caution', REFUSED: 'fault' };

export interface JobNodeData {
  readonly kind: 'job';
  readonly job: CompanyJobView;
  readonly family: Family;
  readonly critical: boolean;
  /** The executions that ran this job's blueprint, newest last. */
  readonly executions: readonly AgentExecutionView[];
}

export interface DepthData {
  readonly kind: 'depth';
  readonly depth: number;
}

export type JobGraphData = JobNodeData | DepthData;

const COLUMN = 280;
const W = 230;
const H = 64;
const GAP = 18;

export function jobFamily(job: CompanyJobView): Family {
  return JOB_FAMILY[job.status] ?? familyFor(job.status);
}

export function layoutJobGraph({ jobs, plan, executions, label }: {
  readonly jobs: readonly CompanyJobView[];
  readonly plan: ImplementationPlanView | null;
  readonly executions: readonly AgentExecutionView[];
  readonly label: (job: CompanyJobView) => string;
}): { readonly nodes: readonly GraphNode<JobGraphData>[]; readonly edges: readonly GraphEdge[]; readonly criticalIds: readonly string[] } {
  const nodes: GraphNode<JobGraphData>[] = [];
  const edges: GraphEdge[] = [];
  const byRef = new Map(jobs.map((job) => [job.blueprint_ref, job]));
  const criticalIds = (plan?.critical_path ?? []).map((ref) => byRef.get(ref)?.id).filter((id): id is string => Boolean(id));
  const critical = new Set(criticalIds);
  const criticalEdges = new Set(criticalIds.slice(1).map((id, i) => `${criticalIds[i]}>${id}`));

  const depths = [...new Set(jobs.map((job) => job.depth))].sort((a, b) => a - b);
  const columns = depths.map((depth) => jobs.filter((job) => job.depth === depth));
  const tallest = Math.max(1, ...columns.map((column) => column.length));
  const known = new Set(jobs.map((job) => job.id));

  depths.forEach((depth, index) => {
    const column = columns[index]!;
    const offset = ((tallest - column.length) * (H + GAP)) / 2;
    nodes.push({ id: `depth:${depth}`, x: index * COLUMN, y: -44, w: W, h: 22, data: { kind: 'depth', depth } });
    column.forEach((job, row) => {
      nodes.push({
        id: job.id, x: index * COLUMN, y: offset + row * (H + GAP), w: W, h: H, label: label(job),
        data: {
          kind: 'job', job, family: jobFamily(job), critical: critical.has(job.id),
          executions: executions.filter((execution) => execution.blueprint_ref === job.blueprint_ref),
        },
      });
    });
  });

  for (const job of jobs) {
    for (const dependency of job.dependency_job_ids ?? []) {
      if (!known.has(dependency)) continue;
      const key = `${dependency}>${job.id}`;
      const upstream = jobs.find((entry) => entry.id === dependency)!;
      edges.push({
        from: dependency, to: job.id, orient: 'h',
        className: criticalEdges.has(key) ? 'e-critical' : jobFamily(job) === 'fault' ? 'e-blocked' : jobFamily(upstream) === 'proof' && jobFamily(job) === 'proof' ? 'e-proof' : 'e-declared',
      });
    }
  }

  return { nodes, edges, criticalIds };
}

/** A job, the jobs it waits on and the jobs that wait on it: the neighbourhood lit on a job's own screen. */
export function neighbourhood(jobs: readonly CompanyJobView[], id: string): ReadonlySet<string> {
  const job = jobs.find((entry) => entry.id === id);
  if (!job) return new Set();
  const upstream = job.dependency_job_ids ?? [];
  const downstream = jobs.filter((entry) => (entry.dependency_job_ids ?? []).includes(id)).map((entry) => entry.id);
  return new Set([id, ...upstream, ...downstream]);
}
