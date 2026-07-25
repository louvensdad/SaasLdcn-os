import { AlertTriangle, Check, Circle, Clock3, Loader2 } from 'lucide-react';

import type { BadgeTone } from '@/components/ui/badge';
import type { GenerationJobStatus, GenerationStageStatus } from '@contracts/generation-job.contract';

// Single source of truth for "GenerationJob status -> UI" decisions. Before
// this module existed, the same information was branched on inline in 4
// separate places (resilient-pipeline.tsx's header badge, jobs/page.tsx's
// statusTone(), two independent TERMINAL status-set constants, and
// FailurePanel's own stalled/buildFailure derivation) -- every message here
// is derived from a REAL backend field, never invented.

export const TERMINAL_JOB_STATUSES = new Set<GenerationJobStatus>(['READY', 'FAILED', 'PAUSED', 'NEEDS_USER_ACTION', 'STALLED']);

export type CanonicalJobState =
  | 'QUEUED' | 'STARTING' | 'RUNNING' | 'RETRYING' | 'WAITING_USER' | 'BLOCKED'
  | 'STALLED' | 'PAUSED' | 'FAILED' | 'COMPLETED';

export interface JobStateInput {
  readonly status: GenerationJobStatus;
  readonly retryCount: number;
  readonly errorKind?: 'failure' | 'stall' | null;
  readonly canContinueWithWarnings?: boolean | null;
}

/** STALLED is real when the backend status says so, or when the last error's
 * own diagnostic already classified it as a stall (job.error.kind==='stall')
 * -- both are real, already-persisted signals, matching the boolean
 * FailurePanel computed inline before this module existed. */
export function isStalledJob(input: Pick<JobStateInput, 'status' | 'errorKind'>): boolean {
  return input.status === 'STALLED' || input.errorKind === 'stall';
}

/**
 * Honest mapping only -- this backend does not have independent real signals
 * for every state the product spec asks for:
 * - PAUSED stays PAUSED, never relabeled CANCELLED: pause() is resumable (a
 *   real resume() action/button exists), so calling it "cancelled" would
 *   misrepresent a resumable state as terminal.
 * - RETRYING is RUNNING + a real retryCount > 0, never its own backend
 *   status -- retryCount is monotonic, so permanently swapping the whole
 *   headline to "retrying" would itself go stale/wrong.
 * - WAITING_USER vs BLOCKED both come from the one real NEEDS_USER_ACTION
 *   status, split by the already-real can_continue_with_warnings flag.
 * - There is no generic non-terminal "WAITING" (this pipeline is strictly
 *   sequential, single-threaded) -- QUEUED already covers "not started yet".
 */
export function canonicalJobState(input: JobStateInput): CanonicalJobState {
  if (isStalledJob(input)) return 'STALLED';
  switch (input.status) {
    case 'QUEUED': return 'QUEUED';
    case 'PREPARING_CONTEXT': return 'STARTING';
    case 'READY': return 'COMPLETED';
    case 'FAILED': return 'FAILED';
    case 'PAUSED': return 'PAUSED';
    case 'NEEDS_USER_ACTION': return input.canContinueWithWarnings ? 'WAITING_USER' : 'BLOCKED';
    default: return input.retryCount > 0 ? 'RETRYING' : 'RUNNING';
  }
}

/** List-view variant: no GenerationJobError object is loaded there, so
 * NEEDS_USER_ACTION defaults to the safer BLOCKED reading rather than
 * guessing "you can proceed" without the real can_continue_with_warnings
 * flag available. */
export function coarseJobState(status: GenerationJobStatus, retryCount = 0): CanonicalJobState {
  return canonicalJobState({ status, retryCount, canContinueWithWarnings: false });
}

export function canonicalStateTone(state: CanonicalJobState): BadgeTone {
  switch (state) {
    case 'COMPLETED': return 'success';
    case 'FAILED': case 'BLOCKED': return 'danger';
    case 'STALLED': case 'PAUSED': case 'WAITING_USER': return 'warning';
    case 'QUEUED': return 'neutral';
    default: return 'accent'; // STARTING, RUNNING, RETRYING
  }
}

type Translator = (key: string, values?: Record<string, string | number>) => string;

export function canonicalStateLabel(t: Translator, state: CanonicalJobState, retryCount = 0): string {
  return t(`pipeline.status.${state}`, state === 'RETRYING' ? { count: retryCount } : undefined);
}

export function stageTone(status: GenerationStageStatus): BadgeTone {
  if (status === 'success') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'stalled') return 'warning';
  if (status === 'skipped') return 'warning';
  if (status === 'running' || status === 'retrying') return 'accent';
  return 'neutral';
}

export function StageIcon({ status }: { readonly status: GenerationStageStatus }) {
  if (status === 'success') return <Check className="h-4 w-4" />;
  if (status === 'failed') return <AlertTriangle className="h-4 w-4" />;
  if (status === 'stalled') return <Clock3 className="h-4 w-4" />;
  if (status === 'skipped') return <AlertTriangle className="h-4 w-4" />;
  if (status === 'running' || status === 'retrying') return <Loader2 className="h-4 w-4 animate-spin" />;
  return <Circle className="h-3.5 w-3.5" />;
}
