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
  | 'BUILD_COMPLETED'
  // LDCN Multi-Agent Runtime, Phase 5: MissionDeliverableJobEngine lifecycle
  // -- the first real second producer for this table/route
  // (entity_type="mission_deliverable_job").
  | 'MISSION_JOB_QUEUED'
  | 'MISSION_DRAFTING_STARTED'
  | 'MISSION_ARTIFACT_DRAFTED'
  | 'MISSION_DRAFTS_READY'
  | 'MISSION_JOB_RETRYING'
  | 'MISSION_JOB_CANCELLED'
  | 'MISSION_JOB_FAILED'
  | 'MISSION_JOB_COMPLETED';

export type GenerationNotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ACTION_REQUIRED';

export interface GenerationNotification {
  readonly id: string;
  readonly user_id: string;
  readonly workspace_id: string | null;
  readonly project_id: string | null;
  // LDCN Multi-Agent Runtime, Phase 5: nullable -- only set for
  // GenerationJob notifications now that a second producer (Mission
  // Deliverable Jobs) exists without one.
  readonly job_id: string | null;
  // LDCN Multi-Agent Runtime, Phase 2: polymorphic subject, additive. For
  // GenerationJob notifications these are redundantly set to
  // ('generation_job', job_id); Mission Deliverable Job notifications use
  // ('mission_deliverable_job', <mdjob id>) instead, with no job_id at all.
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
