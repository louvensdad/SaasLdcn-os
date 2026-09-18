import type { ChangeRequestSummary } from '@contracts/change-request.contract';
import type { GenerationJobSummary } from '@contracts/generation-job.contract';
import type { ProjectRoomSummary } from '@contracts/project-room.contract';

/**
 * The queue of what only a person can move forward. No backend endpoint lists it (gap G4), so it is composed here
 * from the states that actually raise each decision — and every card keeps the state and the read it came from.
 */
export type DecisionKind = 'room' | 'job' | 'change';

export interface Decision {
  readonly id: string;
  readonly kind: DecisionKind;
  /** Which rule raised it; the screen turns this into words. */
  readonly rule: string;
  readonly project: string;
  /** The backend's own value, shown verbatim. */
  readonly state: string;
  readonly source: string;
  /** The screen in this app that takes the decision. */
  readonly href: string;
  /** The same decision in the current app, for the one case this app cannot route. */
  readonly current: string;
  readonly at: string;
}

const ROOM_RULES: Readonly<Record<string, string>> = {
  PROMPT_READY: 'approvePrompt',
  BLUEPRINT_READY: 'runReview',
  ENGINEERING_REVIEW: 'resolveReview',
  ENGINEERING_APPROVED: 'sendToFactory',
};

/** The screen that actually takes each room decision. */
const ROOM_ROUTE: Readonly<Record<string, string>> = {
  PROMPT_READY: 'define/requirements',
  BLUEPRINT_READY: 'define/review',
  ENGINEERING_REVIEW: 'define/review',
  ENGINEERING_APPROVED: 'define/review',
};

const JOB_RULES: Readonly<Record<string, string>> = {
  NEEDS_USER_ACTION: 'jobNeedsAction',
  STALLED: 'jobStalled',
  PAUSED: 'jobPaused',
  READY: 'chooseDelivery',
};

const CHANGE_RULES: Readonly<Record<string, string>> = {
  Draft: 'changeContinue',
  Analyzed: 'changeReview',
  Planned: 'changeApprove',
};

export interface WorkData {
  readonly rooms?: readonly ProjectRoomSummary[];
  readonly jobs?: readonly GenerationJobSummary[];
  readonly changes?: readonly ChangeRequestSummary[];
}

export function deriveDecisions({ rooms, jobs, changes }: WorkData): readonly Decision[] {
  const out: Decision[] = [];
  /* A change request names the GENERATED project; every project screen is keyed by the room. A job carries both,
     so the jobs list is the only place that join exists -- when no job does, the change stays in the current app. */
  const roomOfGenerated = new Map<string, string>();
  for (const job of jobs ?? []) {
    if (job.generatedProjectId) roomOfGenerated.set(job.generatedProjectId, job.projectId);
  }

  for (const room of rooms ?? []) {
    const rule = ROOM_RULES[room.status];
    if (!rule) continue;
    out.push({
      id: `room:${room.room_id}`,
      kind: 'room',
      rule,
      project: room.title,
      state: room.status,
      source: 'GET /api/project-rooms · status',
      href: `/p/${encodeURIComponent(room.room_id)}/${ROOM_ROUTE[room.status]}`,
      current: `/project-rooms/${room.room_id}`,
      at: room.updated_at,
    });
  }

  for (const job of jobs ?? []) {
    if (job.archived) continue;
    const rule = JOB_RULES[job.status];
    if (!rule) continue;
    out.push({
      id: `job:${job.id}`,
      kind: 'job',
      rule,
      project: job.projectName,
      state: job.status,
      source: 'GET /api/meta-factory/jobs · status',
      href: job.status === 'READY'
        ? `/p/${encodeURIComponent(job.projectId)}/delivery`
        : `/p/${encodeURIComponent(job.projectId)}/missions/${encodeURIComponent(job.id)}`,
      current: `/meta-factory?projectId=${encodeURIComponent(job.projectId)}`,
      at: job.updatedAt,
    });
  }

  for (const change of changes ?? []) {
    const rule = CHANGE_RULES[change.status];
    if (!rule) continue;
    out.push({
      id: `change:${change.change_request_id}`,
      kind: 'change',
      rule,
      project: change.intent || change.project_id,
      state: change.status,
      source: 'GET /api/change-requests · status',
      href: roomOfGenerated.has(change.project_id)
        ? `/p/${encodeURIComponent(roomOfGenerated.get(change.project_id) as string)}/engineering/changes/${encodeURIComponent(change.change_request_id)}`
        : '',
      current: '/change-requests',
      at: change.updated_at,
    });
  }

  return out.sort((a, b) => b.at.localeCompare(a.at));
}
