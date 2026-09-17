import type { UserPublic } from '@contracts/auth.contract';
import type { GenerationJobSummary } from '@contracts/generation-job.contract';
import type { ProjectRoomSummary } from '@contracts/project-room.contract';

import type { ActivityFeedResponse } from '@/lib/api/types';

/**
 * The vault's onboarding flow (70 - Frontend Premium/Onboarding Experience), each step read from a backend fact.
 * Nothing here is stored: a step is done only when the platform recorded it, and a source that could not be read
 * makes its steps unknown — never done.
 */
export type StepId = 'signin' | 'start' | 'idea' | 'questions' | 'summary' | 'project' | 'preview' | 'next';
export type StepState = 'done' | 'pending' | 'unknown';

export interface FirstStep {
  readonly id: StepId;
  readonly state: StepState;
  /** When the fact was recorded, if the backend says. */
  readonly at: string | null;
  readonly vars: Readonly<Record<string, string>>;
  /** Where the fact comes from. */
  readonly source: string;
  /** The screen in this app that does the step. */
  readonly href: string;
}

/** A read that may still be loading (undefined), may have failed (null), or holds data. */
export type Read<T> = T | null | undefined;

export interface StepSources {
  readonly user: UserPublic;
  readonly rooms: Read<readonly ProjectRoomSummary[]>;
  readonly jobs: Read<readonly GenerationJobSummary[]>;
  readonly previews: Read<ActivityFeedResponse>;
}

/** Mirrors PROMPT_APPROVED_STATUSES in apps/api/app/services/project_room_service.py. */
const PROMPT_APPROVED = new Set([
  'PROMPT_APPROVED', 'BLUEPRINT_GENERATING', 'BLUEPRINT_READY', 'ENGINEERING_REVIEW', 'ENGINEERING_APPROVED',
  'WAITING_META_FACTORY', 'META_FACTORY_RUNNING', 'GENERATING', 'VALIDATING', 'READY',
]);

const byTime = <T>(items: readonly T[], time: (item: T) => string) => [...items].sort((a, b) => time(a).localeCompare(time(b)));

function step(id: StepId, state: StepState, source: string, href: string, at: string | null = null, vars: Record<string, string> = {}): FirstStep {
  return { id, state, at, vars, source, href };
}

/** The room's own screens, by the step each one answers. */
const room = (roomId: string, screen: 'discovery' | 'requirements' | 'missions') => `/p/${encodeURIComponent(roomId)}/${screen === 'missions' ? 'missions' : `define/${screen}`}`;

export function deriveFirstSteps({ user, rooms, jobs, previews }: StepSources): readonly FirstStep[] {
  const roomsKnown = Array.isArray(rooms);
  const jobsKnown = Array.isArray(jobs);
  const previewsKnown = previews !== null && previews !== undefined;
  const sortedRooms = roomsKnown ? byTime(rooms, (r) => r.created_at) : [];
  const sortedJobs = jobsKnown ? byTime(jobs, (j) => j.createdAt) : [];
  const firstRoom = sortedRooms[0];
  const firstJob = sortedJobs[0];
  const started = previewsKnown ? byTime(previews.items.filter((e) => e.category === 'preview' && e.action === 'started'), (e) => e.occurred_at) : [];
  const firstPreview = started[0];

  const fromRooms = (done: boolean, id: StepId, source: string, current: string, at: string | null, vars: Record<string, string>) =>
    roomsKnown ? step(id, done ? 'done' : 'pending', source, current, done ? at : null, done ? vars : {}) : step(id, 'unknown', source, current);

  const approvedRoom = sortedRooms.find((r) => PROMPT_APPROVED.has(r.status));
  const promptRoom = sortedRooms.find((r) => r.has_prompt_master);

  let next: FirstStep;
  if (!jobsKnown || !previewsKnown) {
    next = step('next', 'unknown', 'GET /api/meta-factory/jobs · GET /api/activity-feed', '/new');
  } else {
    const after = firstPreview ? sortedJobs.find((j) => j.createdAt > firstPreview.occurred_at) : undefined;
    const partial = previews.has_more && !after;
    next = after
      ? step('next', 'done', 'GET /api/meta-factory/jobs', '/projects', after.createdAt)
      : step('next', partial ? 'unknown' : 'pending', 'GET /api/meta-factory/jobs · GET /api/activity-feed', '/new');
  }

  return [
    step('signin', 'done', 'GET /api/auth/me', '/settings/account', user.consent_accepted_at ?? user.created_at, { email: user.email }),
    // The Start screen's other ways to begin (guided mission, import, data, automation) are not read here yet.
    jobsKnown && sortedJobs.length > 0 && (!roomsKnown || sortedRooms.length === 0)
      ? step('start', 'done', 'GET /api/meta-factory/jobs', '/new', firstJob.createdAt, { title: firstJob.projectName })
      : fromRooms(Boolean(firstRoom), 'start', 'GET /api/project-rooms', '/new', firstRoom?.created_at ?? null, { title: firstRoom?.title ?? '' }),
    fromRooms(Boolean(firstRoom), 'idea', 'GET /api/project-rooms', firstRoom ? room(firstRoom.room_id, 'discovery') : '/new', firstRoom?.created_at ?? null, { title: firstRoom?.title ?? '' }),
    fromRooms(Boolean(promptRoom), 'questions', 'GET /api/project-rooms · has_prompt_master', firstRoom ? room(firstRoom.room_id, 'discovery') : '/projects', null, { status: promptRoom?.status ?? '' }),
    approvedRoom || (jobsKnown && sortedJobs.length > 0)
      ? step('summary', 'done', 'GET /api/project-rooms · status', approvedRoom ? room(approvedRoom.room_id, 'requirements') : '/projects', null, { status: approvedRoom?.status ?? 'PROMPT_APPROVED' })
      : fromRooms(false, 'summary', 'GET /api/project-rooms · status', promptRoom ? room(promptRoom.room_id, 'requirements') : '/projects', null, {}),
    jobsKnown
      ? step('project', firstJob ? 'done' : 'pending', 'GET /api/meta-factory/jobs', firstJob ? `/p/${encodeURIComponent(firstJob.projectId)}/missions/${encodeURIComponent(firstJob.id)}` : approvedRoom ? room(approvedRoom.room_id, 'missions') : '/projects', firstJob?.createdAt ?? null, firstJob ? { status: firstJob.status } : {})
      : step('project', 'unknown', 'GET /api/meta-factory/jobs', '/projects'),
    previewsKnown
      ? step('preview', firstPreview ? 'done' : 'pending', 'GET /api/activity-feed?category=preview · PreviewStarted', firstJob ? `/p/${encodeURIComponent(firstJob.projectId)}/runtime` : '/projects', firstPreview?.occurred_at ?? null)
      : step('preview', 'unknown', 'GET /api/activity-feed?category=preview · PreviewStarted', '/projects'),
    next,
  ];
}
