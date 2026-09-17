import type { Family } from '@/components/signal';

/**
 * The status vocabulary of the design system: a backend value is always shown as it came, and its signal family is
 * derived here so the same word never means two different things on two screens.
 */
const LOOKUP: Readonly<Record<string, Family>> = Object.fromEntries([
  ...['PASSED', 'CERTIFIED', 'READY', 'VERIFIED', 'SUCCESS', 'SUCCEEDED', 'HEALTHY', 'ACCEPTED', 'VALID', 'APPROVED', 'CONNECTED', 'COMPLETED', 'FINISHED', 'DELIVERED', 'ENGINEERING_APPROVED', 'PROMPT_APPROVED', 'VALIDATED', 'GENERATED', 'GATEKEEPER_APPROVED', 'READY_FOR_GENERATION', 'CURRENT'].map((value) => [value, 'proof' as Family]),
  ...['QUALIFIED', 'DEGRADED', 'WARNING', 'STALE', 'PARTIAL', 'OBSERVED', 'READY_WITH_WARNINGS', 'GENERATION_BLOCKED', 'BLOCKED', 'UNAVAILABLE', 'CHANGES_REQUIRED', 'PARTIALLY_VERIFIED'].map((value) => [value, 'caution' as Family]),
  ...['FAILED', 'CRITICAL', 'ERROR', 'REJECTED', 'AUTH_ERROR'].map((value) => [value, 'fault' as Family]),
  ...['NEEDS_USER_ACTION', 'NEEDS_HUMAN_REVIEW', 'STALLED', 'PROMPT_READY', 'BLUEPRINT_READY', 'ENGINEERING_REVIEW', 'WAITING_META_FACTORY', 'ANALYZED', 'PLANNED', 'UNDER_REVIEW', 'ACTION_REQUIRED'].map((value) => [value, 'hand' as Family]),
  ...['PAUSED', 'ARCHIVED', 'CANCELLED', 'ROLLED_BACK', 'DEPRECATED', 'SUPERSEDED'].map((value) => [value, 'stop' as Family]),
  ...['QUEUED', 'DRAFT', 'NOT_EXECUTED', 'NOT_RUN', 'PENDING', 'INFO', 'NOT_CONFIGURED', 'SKIPPED', 'SKIPPED_AFTER_FAILURE'].map((value) => [value, 'idle' as Family]),
  ...['META_FACTORY_RUNNING', 'GENERATING', 'VALIDATING', 'APPLYING', 'SPEC_GENERATING', 'BLUEPRINT_GENERATING', 'PROCESSING', 'INITIALIZING'].map((value) => [value, 'pulse' as Family]),
]);

export function familyFor(value: string | null | undefined): Family {
  const key = String(value ?? '').toUpperCase().replace(/[\s-]+/g, '_');
  if (LOOKUP[key]) return LOOKUP[key];
  if (/_(GENERATING|PLANNING|VALIDATING|RUNNING|CREATING|REPAIRING|REVALIDATING)$/.test(key) || key === 'PREPARING_CONTEXT') return 'pulse';
  return 'unknown';
}

/** True while a job is moving through the pipeline — not finished, failed, paused or waiting on a person. */
export function isRunning(status: string): boolean {
  return familyFor(status) === 'pulse';
}
