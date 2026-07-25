// Mirrors app/schemas/generation_notification.py. Title/message are
// intentionally absent -- the frontend renders localized copy from
// `type`+`stage`+`metadata` via i18n (notifications.generation.<type>.*),
// never a server-baked string.

export type GenerationNotificationType =
  | 'TASK_QUEUED'
  | 'TASK_STARTED'
  | 'STAGE_STARTED'
  | 'STAGE_COMPLETED'
  | 'TASK_WAITING_USER'
  | 'TASK_RETRYING'
  | 'TASK_STALLED'
  | 'TASK_FAILED'
  | 'TASK_PAUSED'
  | 'TASK_COMPLETED'
  | 'BUILD_COMPLETED';

export type GenerationNotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ACTION_REQUIRED';

export interface GenerationNotification {
  readonly id: string;
  readonly user_id: string;
  readonly workspace_id: string | null;
  readonly project_id: string | null;
  readonly job_id: string;
  // LDCN Multi-Agent Runtime, Phase 2: polymorphic subject, additive.
  // job_id above is unchanged and still required. For every notification
  // today (all GenerationJob-produced) these are redundantly set to
  // ('generation_job', job_id) -- the general mechanism a future
  // non-GenerationJob producer would use instead of job_id.
  readonly entity_type: string | null;
  readonly entity_id: string | null;
  readonly type: GenerationNotificationType;
  readonly severity: GenerationNotificationSeverity;
  readonly stage: string | null;
  readonly read: boolean;
  readonly action_url: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly created_at: string;
}

export interface GenerationNotificationListResponse {
  readonly items: readonly GenerationNotification[];
  readonly has_more: boolean;
  readonly next_cursor: string | null;
  readonly unread_count: number;
}

export interface MarkAllReadResponse {
  readonly updated: number;
}

// Real-time notification frame carried over the same SSE connection as the
// job's execution events (see stream_generation_job in meta_factory.py).
export interface GenerationNotificationFrame {
  readonly type: 'notification';
  readonly notification: GenerationNotification;
}
