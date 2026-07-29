from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.schemas.common import ApiModel

# Real, persisted, per-user notifications for GenerationJob lifecycle
# transitions. Snake_case, matching every other non-GenerationJob schema in
# this repo -- title/message are intentionally absent (see
# GenerationNotification model docstring): the frontend renders them from
# `type`+`stage`+`metadata` via i18n, never a server-baked string.

GenerationNotificationType = Literal[
    "TASK_QUEUED", "TASK_STARTED", "STAGE_STARTED", "STAGE_COMPLETED",
    "TASK_WAITING_USER", "TASK_RETRYING", "TASK_STALLED", "TASK_FAILED",
    "TASK_PAUSED", "TASK_COMPLETED", "BUILD_COMPLETED",
    # PipelineRecoveryOrchestrator (app.engines.pipeline_recovery_orchestrator)
    # lifecycle -- one recovery attempt for one pipeline failure.
    "DIAGNOSIS_STARTED", "ROOT_CAUSE_FOUND", "CAUSE_CONFIRMED",
    "REPAIR_STARTED", "REPAIR_COMPLETED", "REGRESSION_PASSED",
    "REGRESSION_FAILED", "PIPELINE_RESUMED", "PIPELINE_RECOVERED",
    "RECOVERY_FAILED",
    # LDCN Multi-Agent Runtime, Phase 5: MissionDeliverableJobEngine lifecycle
    # -- the first real second producer for this table (entity_type=
    # "mission_deliverable_job"), proving the Phase 2 polymorphic schema.
    "MISSION_JOB_QUEUED", "MISSION_DRAFTING_STARTED", "MISSION_ARTIFACT_DRAFTED",
    "MISSION_DRAFTS_READY", "MISSION_JOB_RETRYING", "MISSION_JOB_CANCELLED",
    "MISSION_JOB_FAILED", "MISSION_JOB_COMPLETED",
]

GenerationNotificationSeverity = Literal["INFO", "SUCCESS", "WARNING", "ERROR", "ACTION_REQUIRED"]


class GenerationNotification(ApiModel):
    id: str
    user_id: str
    workspace_id: str | None = None
    project_id: str | None = None
    # LDCN Multi-Agent Runtime, Phase 5: nullable -- only set for
    # GenerationJob notifications now that a second producer
    # (Mission Deliverable Jobs) exists without one. entity_type/entity_id
    # (Phase 2) are the general, always-populated mechanism; job_id remains
    # for the existing job-scoped SSE query and read-side filtering.
    job_id: str | None = None
    # Plain `str`, not a Literal -- the set of producers isn't closed yet
    # (same choice event_catalog.py's NamedEvent.category already made for
    # the same reason).
    entity_type: str | None = None
    entity_id: str | None = None
    type: GenerationNotificationType
    severity: GenerationNotificationSeverity = "INFO"
    stage: str | None = None
    read: bool = False
    action_url: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str


class GenerationNotificationListResponse(ApiModel):
    items: list[GenerationNotification]
    has_more: bool
    next_cursor: str | None = None
    unread_count: int


class MarkAllReadResponse(ApiModel):
    updated: int
