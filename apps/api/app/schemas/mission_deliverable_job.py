from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.mission import ArtifactDraft, ArtifactRequestDefinition

# Async, SSE-tracked job that drafts a mission's final-step artifacts (vault
# 38 - Missões). Snake_case, matching every other schema in
# app/schemas/mission.py -- ArtifactDraft/ArtifactRequestDefinition are
# embedded verbatim below, so this wire contract stays internally consistent
# rather than mixing conventions with GenerationJob's schema (which happens
# to be camelCase because its data_json is built as camelCase dicts).

MissionDeliverableJobStatus = Literal[
    "QUEUED", "ANSWERS_LOADING", "DRAFTING", "DRAFTS_READY",
    "PERSISTING", "COMPLETED", "FAILED", "CANCELLED",
]

ArtifactProgressStatus = Literal["pending", "drafting", "ready", "failed"]

MissionDeliverableJobEventType = Literal[
    "job_queued", "answers_loading", "drafting_started", "artifact_drafting_started",
    "artifact_drafted", "artifact_draft_failed", "drafts_ready", "persisting_started",
    "persisted", "job_failed", "job_cancelled",
]


class ArtifactProgress(ApiModel):
    type: str
    title: str
    status: ArtifactProgressStatus = "pending"


class MissionDeliverableJobEvent(ApiModel):
    id: str
    job_id: str
    timestamp: str
    stage: str
    type: MissionDeliverableJobEventType
    level: Literal["info", "warning", "error"] = "info"
    message: str
    artifact_type: str | None = None


class MissionDeliverableJobErrorDetail(ApiModel):
    kind: Literal["llm_error", "mission_not_found", "worker_lease_expired", "confirm_failed"]
    message: str
    artifact_type: str | None = None


class MissionDeliverableJob(ApiModel):
    id: str
    mission_id: str
    workspace_id: str | None = None
    status: MissionDeliverableJobStatus
    idempotency_key: str | None = None
    error: MissionDeliverableJobErrorDetail | None = None
    artifacts_progress: list[ArtifactProgress] = Field(default_factory=list)
    drafts: list[ArtifactDraft] = Field(default_factory=list)
    degraded: bool = False
    events: list[MissionDeliverableJobEvent] = Field(default_factory=list)
    created_at: str
    updated_at: str
    completed_at: str | None = None
    heartbeat_at: str | None = None


class CompileDeliverablesRequest(ApiModel):
    artifact_definitions: list[ArtifactRequestDefinition] = Field(min_length=1)
    step_titles: dict[str, str] = Field(default_factory=dict)
    user_model_choice: str | None = None
    use_user_key: bool = False
    idempotency_key: str = Field(min_length=8, max_length=128)


class RetryDeliverablesRequest(ApiModel):
    user_model_choice: str | None = None
    use_user_key: bool = False
