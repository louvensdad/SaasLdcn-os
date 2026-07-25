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
]

GenerationNotificationSeverity = Literal["INFO", "SUCCESS", "WARNING", "ERROR", "ACTION_REQUIRED"]


class GenerationNotification(ApiModel):
    id: str
    user_id: str
    workspace_id: str | None = None
    project_id: str | None = None
    job_id: str
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
