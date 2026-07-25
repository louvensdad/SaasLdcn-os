import type { GenerationNotification, GenerationNotificationSeverity, GenerationNotificationType } from '@contracts/generation-notification.contract';

export type NotificationTone = 'success' | 'warning' | 'error' | 'info';

const SEVERITY_TONE: Record<GenerationNotificationSeverity, NotificationTone> = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
  ACTION_REQUIRED: 'error',
};

export function notificationTone(severity: GenerationNotificationSeverity): NotificationTone {
  return SEVERITY_TONE[severity];
}

// camelCase segment per backend type, used to build the i18n key path below.
// Title/message are never server-baked (see GenerationNotification model) --
// this is the client-side rendering half of that contract.
const TYPE_KEY: Record<GenerationNotificationType, string> = {
  TASK_QUEUED: 'taskQueued',
  TASK_STARTED: 'taskStarted',
  STAGE_STARTED: 'stageStarted',
  STAGE_COMPLETED: 'stageCompleted',
  TASK_WAITING_USER: 'taskWaitingUser',
  TASK_RETRYING: 'taskRetrying',
  TASK_STALLED: 'taskStalled',
  TASK_FAILED: 'taskFailed',
  TASK_PAUSED: 'taskPaused',
  TASK_COMPLETED: 'taskCompleted',
  BUILD_COMPLETED: 'buildCompleted',
  MISSION_JOB_QUEUED: 'missionJobQueued',
  MISSION_DRAFTING_STARTED: 'missionDraftingStarted',
  MISSION_ARTIFACT_DRAFTED: 'missionArtifactDrafted',
  MISSION_DRAFTS_READY: 'missionDraftsReady',
  MISSION_JOB_RETRYING: 'missionJobRetrying',
  MISSION_JOB_CANCELLED: 'missionJobCancelled',
  MISSION_JOB_FAILED: 'missionJobFailed',
  MISSION_JOB_COMPLETED: 'missionJobCompleted',
};

export function notificationTitleKey(type: GenerationNotificationType): string {
  return `notifications.generation.${TYPE_KEY[type]}.title`;
}

export function notificationMessageKey(type: GenerationNotificationType): string {
  return `notifications.generation.${TYPE_KEY[type]}.message`;
}

// Browser Notification API allowlist: only outcomes a user genuinely needs to
// know about while looking away from the tab. Never per-stage events (those
// would fire a native OS notification every few seconds during a run).
export const BROWSER_NOTIFICATION_TYPES = new Set<GenerationNotificationType>([
  'TASK_COMPLETED', 'TASK_FAILED', 'TASK_WAITING_USER',
]);

/** Shows a native browser notification, but only when every real condition
 * holds: an allowlisted terminal type, the tab is actually in the background
 * (never while the user is looking at it), and OS permission is genuinely
 * granted right now. The caller's own opt-in preference is checked before
 * calling this -- this function only enforces the conditions that are never
 * safe to skip regardless of that preference. */
export function maybeShowBrowserNotification(notification: GenerationNotification, title: string, body: string): void {
  if (!BROWSER_NOTIFICATION_TYPES.has(notification.type)) return;
  if (typeof document === 'undefined' || !document.hidden) return;
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  // eslint-disable-next-line no-new -- fire-and-forget native notification
  new Notification(title, { body, tag: notification.id });
}
