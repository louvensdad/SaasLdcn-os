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

/* The part of the system a composed state names, and what is being done to it: BACKEND_GENERATING,
   PACKAGE_CREATING, VALIDATION_FAILED. The suffix list is the same one familyFor reasons about. */
const DOING = /_(GENERATING|VALIDATING|REVALIDATING|RUNNING|CREATING|PLANNING|REPAIRING|FAILED|COMPLETED|BLOCKED)$/;

/**
 * The sentence a person reads for a backend state. REDESIGN.md 3.1: the state stays exactly as it is in
 * the contract with the service, and only its presentation is translated -- Badge still carries the code
 * in the technical detail, so nothing is hidden, it just stops being the headline.
 *
 * Three steps, in order: the state's own phrase; a phrase composed from the part and the action when the
 * backend built the code that way; and, for a code nobody has mapped yet, the words of the code itself
 * rather than a SCREAMING_SNAKE token in the middle of a sentence. The audit fails on an unmapped code
 * that a screen actually renders, so step three stays a safety net and never a habit.
 */
export function statusLabel(value: string | null | undefined, tDynamic: (key: string, vars?: Record<string, string | number>) => string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const code = raw.toUpperCase().replace(/[\s-]+/g, '_');
  const own = `status.${code}`;
  const phrase = tDynamic(own);
  if (phrase !== own) return phrase;
  const doing = code.match(DOING);
  if (doing) {
    const partKey = `status.part.${code.slice(0, code.length - doing[0].length)}`;
    const doingKey = `status.doing.${doing[1]}`;
    const part = tDynamic(partKey);
    if (part !== partKey) {
      const sentence = tDynamic(doingKey, { part });
      if (sentence !== doingKey) return sentence;
    }
  }
  return code.toLowerCase().split('_').filter(Boolean).join(' ').replace(/^./, (first) => first.toUpperCase());
}
