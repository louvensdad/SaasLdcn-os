import type { DeliveryDecision } from '@contracts/delivery.contract';
import type { EngineeringKernelStatus } from '@contracts/engineering-kernel.contract';
import type { ResilientGenerationJob } from '@contracts/generation-job.contract';
import type { ProjectRoom } from '@contracts/project-room.contract';

import type { GraphEdge, GraphNode } from '@/components/canvas/geometry';
import type { Family } from '@/components/signal';
import { missionQuery } from '@/lib/project/mission-scope';
import { familyFor, isRunning } from '@/lib/status';

/**
 * The mission map (V2 signature drawing): Define descends as a column, the work turns and runs to the delivery gate.
 * Every station carries the backend's own word and the field it came from. A read that failed or has not answered is
 * `unknown` (dashed); a step that cannot exist yet is `NOT_RUN` — neither is ever drawn as proof.
 */
export type MapStationId =
  | 'definition' | 'requirements' | 'architecture' | 'review'
  | 'company' | 'generate' | 'build' | 'quality' | 'certification' | 'delivery';

export const DEFINE: readonly MapStationId[] = ['definition', 'requirements', 'architecture', 'review'];
export const RUN: readonly MapStationId[] = ['company', 'generate', 'build', 'quality', 'certification', 'delivery'];
export const PHASES: readonly { readonly id: 'assemble' | 'prove' | 'deliver'; readonly stations: readonly MapStationId[] }[] = [
  { id: 'assemble', stations: ['company'] },
  { id: 'prove', stations: ['generate', 'build', 'quality', 'certification'] },
  { id: 'deliver', stations: ['delivery'] },
];

/** The logical stage statuses of `stageStatuses`, in the backend's lower-case words. */
export const STAGE_FAMILY: Readonly<Record<string, Family>> = {
  waiting: 'idle', running: 'pulse', success: 'proof', failed: 'fault', skipped: 'na', retrying: 'caution', stalled: 'hand',
};

export interface MapStation {
  readonly id: MapStationId;
  /** The backend value, verbatim. */
  readonly state: string;
  readonly family: Family;
  /** Only while the backend reports this station running. */
  readonly live: boolean;
  readonly href: string | null;
  /** The endpoint and field the state was read from: a developer detail. */
  readonly source: string;
}

export interface MapStage {
  readonly id: string;
  readonly state: string;
  readonly family: Family;
  readonly live: boolean;
}

interface Read<T> {
  readonly data?: T | null;
  readonly isError: boolean;
}

const UNKNOWN = { state: 'unknown', family: 'unknown' as Family };
const NOT_RUN = { state: 'NOT_RUN', family: 'idle' as Family };

export function missionStations({ room, job, kernel, delivery, base }: {
  readonly room: Read<ProjectRoom>;
  readonly job: ResilientGenerationJob;
  readonly kernel: Read<EngineeringKernelStatus>;
  readonly delivery: Read<DeliveryDecision>;
  /** `/p/{projectKey}` */
  readonly base: string;
}): { readonly stations: readonly MapStation[]; readonly stages: readonly MapStage[] } {
  const roomRead = 'GET /api/project-rooms/{room_id}';
  const jobRead = 'GET /api/meta-factory/jobs/{job_id}';
  const kernelRead = 'GET /api/meta-factory/{project_id}/engineering-kernel';
  const deliveryRead = 'GET /api/meta-factory/{project_id}/delivery';
  const r = room.data ?? null;
  const running = isRunning(job.status);

  const station = (id: MapStationId, value: { readonly state: string; readonly family: Family }, source: string, href: string | null, live = false): MapStation =>
    ({ id, state: value.state, family: value.family, live, href, source });

  const definition = r ? { state: r.status, family: familyFor(r.status) } : UNKNOWN;
  const lastPrompt = r?.prompt_master_versions[r.prompt_master_versions.length - 1];
  const requirements = !r ? UNKNOWN : lastPrompt ? { state: `V${lastPrompt.version}`, family: (lastPrompt.degraded ? 'caution' : 'proof') as Family } : NOT_RUN;
  const blueprint = r ? r.active_blueprint_version ?? r.architecture_blueprint?.version ?? null : null;
  const architecture = !r ? UNKNOWN : blueprint != null ? { state: `V${blueprint}`, family: 'proof' as Family } : NOT_RUN;
  const readiness = r?.engineering_review?.generation_readiness;
  const review = !r ? UNKNOWN : readiness ? { state: readiness, family: familyFor(readiness) } : NOT_RUN;

  /* A company is written with the job; jobs created before it carry no snapshot at all, which is not "empty". */
  const companyStatus = job.virtualCompany?.status;
  const companyFamily: Family = companyStatus === 'OPEN' ? (running ? 'pulse' : 'idle') : companyStatus === 'CLOSED' ? 'proof' : 'unknown';
  const company = companyStatus ? { state: companyStatus, family: companyFamily } : NOT_RUN;

  const generate = { state: job.status, family: familyFor(job.status) };
  const build = { state: job.buildStatus, family: job.buildStatus === 'RUNNING' ? 'pulse' as Family : familyFor(job.buildStatus) };

  /* Quality, certification and delivery belong to the project this mission generated — not to the room's latest. */
  const generated = Boolean(job.generatedProjectId);
  const k = kernel.data ?? null;
  const quality = !generated ? NOT_RUN : k
    ? (k.quality_gate_blocker_count === 0 ? { state: 'NO BLOCKER', family: 'proof' as Family } : { state: `${k.quality_gate_blocker_count} BLOCKER`, family: 'fault' as Family })
    : UNKNOWN;
  const certification = !generated ? NOT_RUN : k ? { state: k.kernel_phase, family: familyFor(k.kernel_phase) } : UNKNOWN;
  const d = delivery.data ?? null;
  const chosen = d?.current_profile?.delivery_mode;
  const deliveryState = !generated ? NOT_RUN : !d ? UNKNOWN
    : chosen ? { state: chosen.toUpperCase(), family: 'proof' as Family }
      : d.blocked ? { state: 'BLOCKED', family: 'caution' as Family }
        : { state: 'NOT_CHOSEN', family: 'hand' as Family };

  const missionBase = `${base}/missions/${encodeURIComponent(job.id)}`;
  /* The evidence screen reads the latest mission's project unless told which mission: these stations were read for this one. */
  const evidenceHref = `${base}/evidence${missionQuery(job.id)}`;
  const stations: MapStation[] = [
    station('definition', definition, `${roomRead} · status`, `${base}/define/discovery`),
    station('requirements', requirements, `${roomRead} · prompt_master_versions`, `${base}/define/requirements`),
    station('architecture', architecture, `${roomRead} · active_blueprint_version`, `${base}/define/architecture`),
    station('review', review, `${roomRead} · engineering_review.generation_readiness`, `${base}/define/review`),
    station('company', company, `${jobRead} · virtualCompany.status`, companyStatus ? `${missionBase}/company` : null, companyFamily === 'pulse'),
    station('generate', generate, `${jobRead} · status, stageStatuses`, null, running),
    station('build', build, `${jobRead} · buildStatus`, `${base}/engineering/verification`, job.buildStatus === 'RUNNING'),
    station('quality', quality, `${kernelRead} · quality_gate_blocker_count`, evidenceHref),
    station('certification', certification, `${kernelRead} · kernel_phase`, evidenceHref),
    station('delivery', deliveryState, `${deliveryRead} · current_profile, blocked`, `${base}/delivery`),
  ];

  const stages = Object.entries(job.stageStatuses ?? {}).map(([id, status]) => ({
    id, state: status, family: STAGE_FAMILY[status] ?? 'unknown', live: status === 'running',
  }));
  return { stations, stages };
}

/* ---------------------------------------------------------------- layout */

export type MapNodeData =
  | { readonly kind: 'station'; readonly station: MapStation; readonly vertical: boolean }
  | { readonly kind: 'stage'; readonly stage: MapStage }
  | { readonly kind: 'band'; readonly phase: 'define' | 'assemble' | 'prove' | 'deliver' };

const DIAL = 48;
const SUB = 32;
const ROW = 66;
const SLOT = 144;
const RUN_X = 262;
const STAGE_GAP = 90;

export function edgeClass(from: Family, to: Family): string {
  if (to === 'hand') return 'e-hand';
  if (to === 'pulse') return 'e-live';
  if (to === 'fault') return 'e-blocked';
  if (to === 'unknown' || from === 'unknown') return 'e-declared';
  if (from === 'proof' && to === 'proof') return 'e-proof';
  return '';
}

export function layoutMissionMap({ stations, stages, expanded, name, stageLabel, toggleLabel }: {
  readonly stations: readonly MapStation[];
  readonly stages: readonly MapStage[];
  readonly expanded: boolean;
  readonly name: (id: MapStationId) => string;
  readonly stageLabel: (stage: MapStage) => string;
  readonly toggleLabel: (expanded: boolean) => string;
}): { readonly nodes: readonly GraphNode<MapNodeData>[]; readonly edges: readonly GraphEdge[] } {
  const nodes: GraphNode<MapNodeData>[] = [];
  const edges: GraphEdge[] = [];
  const byId = new Map(stations.map((s) => [s.id, s]));
  const family = (id: MapStationId) => byId.get(id)?.family ?? 'unknown';

  nodes.push({ id: 'band:define', x: 0, y: -40, w: 220, h: 22, data: { kind: 'band', phase: 'define' } });
  DEFINE.forEach((id, i) => {
    const s = byId.get(id);
    if (!s) return;
    nodes.push({
      id, x: 0, y: i * ROW, w: 220, h: DIAL, anchor: { x: 0, y: 0, w: DIAL, h: DIAL },
      label: `${name(id)}: ${s.state}`, data: { kind: 'station', station: s, vertical: true },
    });
    if (i > 0) edges.push({ from: DEFINE[i - 1]!, to: id, orient: 'v', className: edgeClass(family(DEFINE[i - 1]!), s.family) });
  });

  const runCY = 3 * ROW + DIAL / 2 + 104;
  const runTop = runCY - DIAL / 2;
  const cx = (i: number) => RUN_X + i * SLOT + SLOT / 2;

  PHASES.forEach((phase) => {
    const first = RUN.indexOf(phase.stations[0]!);
    const last = RUN.indexOf(phase.stations[phase.stations.length - 1]!);
    nodes.push({
      id: `band:${phase.id}`, x: RUN_X + first * SLOT + 8, y: runTop - 48, w: (last - first + 1) * SLOT - 16, h: 22,
      data: { kind: 'band', phase: phase.id },
    });
  });

  RUN.forEach((id, i) => {
    const s = byId.get(id);
    if (!s) return;
    const hasStages = id === 'generate' && stages.length > 0;
    nodes.push({
      id, x: cx(i) - 68, y: runTop, w: 136, h: DIAL + 60, anchor: { x: 68 - DIAL / 2, y: 0, w: DIAL, h: DIAL },
      label: `${name(id)}: ${s.state}`, data: { kind: 'station', station: s, vertical: false },
      toggle: hasStages ? { expanded, label: toggleLabel(expanded) } : undefined,
    });
    const previous = i === 0 ? 'review' : RUN[i - 1]!;
    edges.push({ from: previous, to: id, shape: i === 0 ? 'elbow' : undefined, orient: 'h', className: edgeClass(family(previous), s.family) });
  });

  if (expanded && stages.length > 0) {
    const origin = cx(RUN.indexOf('generate'));
    const top = runTop + DIAL + 82;
    stages.forEach((stage, k) => {
      const id = `stage:${stage.id}`;
      nodes.push({
        id, x: origin + k * STAGE_GAP - 44, y: top, w: 88, h: SUB + 44, anchor: { x: 44 - SUB / 2, y: 0, w: SUB, h: SUB },
        label: stageLabel(stage), data: { kind: 'stage', stage },
      });
      edges.push(k === 0
        ? { from: 'generate', to: id, shape: 'drop', className: `e-declared${stage.family === 'proof' ? ' e-proof' : ''}` }
        : { from: `stage:${stages[k - 1]!.id}`, to: id, orient: 'h', className: edgeClass(stages[k - 1]!.family, stage.family) });
    });
  }

  return { nodes, edges };
}
