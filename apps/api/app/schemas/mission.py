from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.schemas.common import ApiModel

# Mission Workspace (vault 38 - Missões). Field/action/rule authoring lives in
# TypeScript (apps/web/modules/mission-workspace/registry) -- these schemas
# are the wire contract only, mirrored by packages/contracts/mission.contract.ts.

MissionCategory = Literal["create", "analyze", "fix", "evolve", "plan", "research"]

MissionStatus = Literal["active", "paused", "completed", "abandoned"]

ExecutionMode = Literal["guided", "quick", "expert", "analysis", "collaborative", "autonomous", "learning"]

ExperienceLevel = Literal["beginner", "intermediate", "advanced", "expert"]

GapSeverity = Literal["critical", "important", "optional"]
RiskSeverity = Literal["critical", "high", "medium", "low"]
DecisionSource = Literal["user", "ai_accepted", "ai_modified", "default"]

SpecialistRole = Literal[
    "software_architect", "backend_engineer", "frontend_engineer", "database_engineer",
    "security_engineer", "qa_engineer", "devops_engineer", "automation_architect",
    "integration_specialist", "risk_analyst", "technical_writer", "performance_analyst",
    "security_auditor", "product_strategist", "data_analyst",
]

ArtifactFormat = Literal["json", "markdown", "yaml", "text", "html"]


class Decision(ApiModel):
    id: str
    step_id: str
    field_id: str
    value: Any = None
    source: DecisionSource = "user"
    reason: str | None = None
    created_at: str
    impacts: list[dict[str, Any]] = Field(default_factory=list)


class Rejection(ApiModel):
    id: str
    suggestion_id: str
    reason: str | None = None
    timestamp: str


class MissionInputs(ApiModel):
    text: list[str] = Field(default_factory=list)
    files: list[dict[str, Any]] = Field(default_factory=list)
    code: list[dict[str, Any]] = Field(default_factory=list)
    logs: list[str] = Field(default_factory=list)
    urls: list[str] = Field(default_factory=list)
    schemas: list[str] = Field(default_factory=list)
    project_ref: str | None = None


class Gap(ApiModel):
    id: str
    title: str
    description: str
    severity: GapSeverity
    related_step_id: str | None = None
    suggested_action: str = ""
    status: Literal["open", "addressed", "dismissed"] = "open"
    dismiss_reason: str | None = None


class Risk(ApiModel):
    id: str
    severity: RiskSeverity
    category: str
    title: str
    description: str
    affected_steps: list[str] = Field(default_factory=list)
    suggested_action: str = ""
    auto_detected: bool = True
    dismissed: bool = False


class Inconsistency(ApiModel):
    id: str
    title: str
    description: str
    affected_fields: list[str] = Field(default_factory=list)
    suggested_fix: str = ""
    blocking: bool = False


class MissionArtifact(ApiModel):
    id: str
    type: str
    title: str
    content: Any = None
    format: ArtifactFormat = "markdown"
    generated_at: str
    can_feed_mission: list[str] = Field(default_factory=list)


class JourneyStepState(ApiModel):
    definition_id: str
    status: Literal["pending", "active", "completed", "skipped", "blocked", "attention"] = "pending"
    completed_at: str | None = None
    validation_status: Literal["valid", "invalid", "warning"] | None = None
    alerts: list[dict[str, Any]] = Field(default_factory=list)


class JourneyState(ApiModel):
    step_ids: list[str] = Field(default_factory=list)
    current_step_id: str | None = None
    progress: int = 0
    steps: list[JourneyStepState] = Field(default_factory=list)


class MissionContext(ApiModel):
    inputs: MissionInputs = Field(default_factory=MissionInputs)
    answers: dict[str, Any] = Field(default_factory=dict)  # "stepId.fieldId" -> value
    decisions: list[Decision] = Field(default_factory=list)
    rejections: list[Rejection] = Field(default_factory=list)
    gaps: list[Gap] = Field(default_factory=list)
    risks: list[Risk] = Field(default_factory=list)
    inconsistencies: list[Inconsistency] = Field(default_factory=list)
    history: list[dict[str, Any]] = Field(default_factory=list)
    derived: dict[str, Any] = Field(default_factory=dict)


class MissionInstance(ApiModel):
    id: str
    type: str
    workspace_id: str | None = None
    status: MissionStatus = "active"
    mode: ExecutionMode = "guided"
    experience_level: ExperienceLevel = "intermediate"
    title: str = ""
    context: MissionContext = Field(default_factory=MissionContext)
    journey: JourneyState = Field(default_factory=JourneyState)
    artifacts: list[MissionArtifact] = Field(default_factory=list)
    degraded: bool = False
    created_at: str
    updated_at: str
    version: int = 1


class MissionInstanceSummary(ApiModel):
    id: str
    type: str
    workspace_id: str | None = None
    status: MissionStatus
    title: str
    degraded: bool = False
    progress: int = 0
    created_at: str
    updated_at: str


class CreateMissionRequest(ApiModel):
    mission_type: str
    title: str = ""
    mode: ExecutionMode = "guided"
    experience_level: ExperienceLevel = "intermediate"
    workspace_id: str | None = None


class AutosaveMissionRequest(ApiModel):
    """PATCH body: every field optional, only provided ones are merged."""

    title: str | None = None
    status: MissionStatus | None = None
    mode: ExecutionMode | None = None
    context: MissionContext | None = None
    journey: JourneyState | None = None
    version: int | None = None


class ExecuteFieldActionRequest(ApiModel):
    step_id: str
    field_id: str
    action_id: str
    specialist: SpecialistRole | None = None
    # Interpolation ({{field}} -> context.answers value) happens client-side
    # (ContextEngine.interpolatePrompt) -- the backend only ever sees the
    # already-resolved prompt text, never a raw template with the user's
    # other answers baked in server-side.
    interpolated_prompt: str = Field(min_length=1)
    insert_mode: Literal["replace", "append", "suggest"] = "suggest"
    user_model_choice: str | None = None
    use_user_key: bool = False


class FieldActionResult(ApiModel):
    content: str
    insert_mode: Literal["replace", "append", "suggest"]
    degraded: bool = False


class RecordDecisionRequest(ApiModel):
    step_id: str
    field_id: str
    value: Any = None
    source: DecisionSource = "user"
    reason: str | None = None


class ArtifactRequestDefinition(ApiModel):
    """One artifact the frontend's genome (apps/web/modules/mission-workspace)
    wants compiled -- the backend has no genome of its own to look this up in,
    since field/artifact authoring lives in TypeScript."""

    type: str
    title: str
    can_feed_mission: list[str] = Field(default_factory=list)


class GenerateArtifactsRequest(ApiModel):
    artifact_definitions: list[ArtifactRequestDefinition] = Field(min_length=1)
    step_titles: dict[str, str] = Field(default_factory=dict)  # stepId -> title, for section headers
    user_model_choice: str | None = None
    use_user_key: bool = False


class ArtifactDraft(ApiModel):
    """A generated-but-not-yet-persisted artifact. Nothing here is saved to
    the mission until the user explicitly reviews and confirms it -- see
    ConfirmArtifactsRequest."""

    type: str
    title: str
    content: str
    format: ArtifactFormat = "markdown"
    can_feed_mission: list[str] = Field(default_factory=list)
    degraded: bool = False


class GenerateArtifactsPreviewResponse(ApiModel):
    drafts: list[ArtifactDraft]
    degraded: bool = False


class ConfirmArtifactsRequest(ApiModel):
    artifacts: list[ArtifactDraft] = Field(min_length=1)
