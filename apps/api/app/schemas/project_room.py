from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.schemas.architecture_blueprint import ArchitectureBlueprint, StackProposal
from app.schemas.architecture_model import ArchitectureModel
from app.schemas.common import ApiModel
from app.schemas.execution_profile import ExecutionProfileId
from app.schemas.orchestrator import ClarifyingQuestion, ProjectSpec


ProjectRoomStatus = Literal[
    "DRAFT",
    "UNDER_REVIEW",
    "PROMPT_READY",
    "PROMPT_APPROVED",
    "BLUEPRINT_GENERATING",
    "BLUEPRINT_READY",
    "ENGINEERING_REVIEW",
    "ENGINEERING_APPROVED",
    "WAITING_META_FACTORY",
    "META_FACTORY_RUNNING",
    "GENERATING",
    "VALIDATING",
    "READY",
    "FAILED",
    "ARCHIVED",
]

MessageRole = Literal["user", "assistant", "system"]
ReadinessStatus = Literal["passed", "failed", "pending"]
OperationStatus = Literal["pending", "running", "success", "failed", "rollback"]

# Decided at room creation, before PromptMaster generation begins (LDCN OS spec
# section 7, step 1). "full_stack" means web + mobile together; "backend" means
# an API-only delivery with no UI at all (web or mobile).
DeliveryType = Literal["web", "backend", "mobile", "full_stack"]

# Backend language the USER picked at room creation ("" = auto: the orchestrator
# suggests one). Values are the language-specialist profile ids
# (app/data/language_agent_profiles.py) — the stacks the factory is proven on.
PreferredLanguage = Literal[
    "", "python", "typescript", "java", "csharp", "go", "rust", "php", "ruby", "kotlin"
]


class ProjectRoomMessage(ApiModel):
    id: str
    role: MessageRole
    content: str
    degraded: bool = False
    created_at: str


class PromptMasterSectionRef(ApiModel):
    id: str
    title: str


class PromptMasterVersion(ApiModel):
    version: int
    markdown: str
    sections: list[PromptMasterSectionRef] = Field(default_factory=list)
    generated_at: str
    degraded: bool = False
    project_name: str | None = None


class GenerationJob(ApiModel):
    """The hand-off record created when a project is sent to the Meta-Factory."""

    handoff_id: str
    status: str
    project_id: str
    workspace_id: str | None = None
    prompt_master_version: int
    project_name: str | None = None
    generated_project_id: str | None = None
    message: str
    created_at: str


class ProjectReadinessCheck(ApiModel):
    id: str
    label: str
    status: ReadinessStatus
    detail: str
    required: bool = True


class ProjectRoomWorkflow(ApiModel):
    status: ProjectRoomStatus
    status_label: str
    progress: int
    primary_action: str | None = None
    can_send_to_meta_factory: bool = False
    blocking_reasons: list[str] = Field(default_factory=list)
    expected_next_statuses: list[ProjectRoomStatus] = Field(default_factory=list)


class ProjectRoomHistoryEvent(ApiModel):
    id: str
    event: str
    actor: str
    source: str
    created_at: str
    metadata: dict[str, str | int | float | bool | None] = Field(default_factory=dict)


class ProjectRoomOperationLog(ApiModel):
    id: str
    timestamp: str
    method: str | None = None
    endpoint: str | None = None
    http_status: int | None = None
    status: OperationStatus
    message: str
    detail: str | None = None


class BlueprintVersion(ApiModel):
    id: str
    version: int
    blueprint: ArchitectureBlueprint
    provider: str | None = None
    providerLabel: str = "Nenhum"
    model: str | None = None
    generated_at: str
    generation_time_ms: int = 0
    tokens: dict[str, int] = Field(default_factory=dict)
    user: str
    score: int
    hash: str
    prompt: str
    base_version: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ProjectRoomFailureDiagnostic(ApiModel):
    status_current: str
    status_expected: list[str] = Field(default_factory=list)
    endpoint_called: str
    http_status: int
    backend_message: str
    rejection_reason: str
    correction: str
    checks: list[ProjectReadinessCheck] = Field(default_factory=list)


ReviewScoreStatus = Literal["scored", "unavailable"]


class ReviewScoreCategory(ApiModel):
    key: str
    label: str
    status: ReviewScoreStatus
    score: int | None = None  # 0..100 when scored; None when status == "unavailable"
    basis: str


class ReviewScore(ApiModel):
    overall: int | None = None  # average of scored categories; None if nothing scorable
    categories: list[ReviewScoreCategory] = Field(default_factory=list)


class EngineeringReviewFinding(ApiModel):
    title: str
    detail: str = ""
    area: str | None = None


CommitteeVerdict = Literal["approved", "approved_with_caveats", "changes_requested"]


class CommitteeMember(ApiModel):
    role: str
    rating: int  # 0..5 stars, derived from real signals
    verdict: CommitteeVerdict
    rationale: str
    signals: list[str] = Field(default_factory=list)


class ReviewDimension(ApiModel):
    key: str
    label: str
    status: ReviewScoreStatus  # "scored" | "unavailable"
    score: int | None = None
    verdict: str = ""
    findings: list[str] = Field(default_factory=list)


class FinalOpinion(ApiModel):
    """The committee's final 'parecer'. Deterministic by default; the disclaimer is
    explicit about reduced depth when no LLM authored the underlying blueprint."""

    deterministic: bool = True
    success_probability: int | None = None  # 0..100; None when not derivable
    complexity: str = ""
    risk: str = ""
    scalability: str = ""
    narrative: str = ""
    disclaimer: str = ""


class EngineeringReviewAssessment(ApiModel):
    """A technical committee's critical reading of the blueprint — distinct from
    the Architect's own decision cards. Built deterministically from real spec +
    blueprint data; never invents findings."""

    good_decisions: list[EngineeringReviewFinding] = Field(default_factory=list)
    debatable_decisions: list[EngineeringReviewFinding] = Field(default_factory=list)
    risks: list[EngineeringReviewFinding] = Field(default_factory=list)
    gaps: list[EngineeringReviewFinding] = Field(default_factory=list)
    inconsistencies: list[EngineeringReviewFinding] = Field(default_factory=list)
    scalability_impact: str = ""
    security_impact: str = ""
    generation_readiness: str = ""
    recommendations: list[str] = Field(default_factory=list)
    score: ReviewScore | None = None
    committee: list[CommitteeMember] = Field(default_factory=list)
    dimensions: list[ReviewDimension] = Field(default_factory=list)
    final_opinion: FinalOpinion | None = None


class ProjectRoomOrigin(ApiModel):
    """Provenance for a room seeded programmatically instead of via chat.
    Absent (None) for every room created through the normal journey."""

    source: Literal["MISSION_WORKSPACE"]
    mission_id: str
    deliverable_job_id: str
    handoff_id: str


class ProjectRoom(ApiModel):
    room_id: str
    workspace_id: str | None = None
    origin: ProjectRoomOrigin | None = None
    title: str
    status: ProjectRoomStatus
    delivery_type: DeliveryType = "web"
    preferred_language: PreferredLanguage = ""
    execution_profile: ExecutionProfileId = "professional"
    raw_intent: str = ""
    locale: str = "pt-BR"
    confidence: float = 0.0
    degraded: bool = False
    spec: ProjectSpec | None = None
    open_questions: list[ClarifyingQuestion] = Field(default_factory=list)
    messages: list[ProjectRoomMessage] = Field(default_factory=list)
    prompt_master_md: str | None = None
    prompt_master_versions: list[PromptMasterVersion] = Field(default_factory=list)
    architecture_blueprint: ArchitectureBlueprint | None = None
    blueprint_versions: list[BlueprintVersion] = Field(default_factory=list)
    active_blueprint_version: int | None = None
    # Stack Approval Gate: the proposed stack (choice + reason + alternatives per
    # area) and the current approval state, derived from the active blueprint.
    stack_proposal: StackProposal | None = None
    generation_handoff: GenerationJob | None = None
    readiness_checklist: list[ProjectReadinessCheck] = Field(default_factory=list)
    engineering_review: EngineeringReviewAssessment | None = None
    architecture_model: ArchitectureModel | None = None
    workflow: ProjectRoomWorkflow | None = None
    history: list[ProjectRoomHistoryEvent] = Field(default_factory=list)
    operational_log: list[ProjectRoomOperationLog] = Field(default_factory=list)
    last_failure: ProjectRoomFailureDiagnostic | None = None
    created_at: str
    updated_at: str


class ProjectRoomSummary(ApiModel):
    room_id: str
    workspace_id: str | None = None
    title: str
    status: ProjectRoomStatus
    delivery_type: DeliveryType = "web"
    preferred_language: PreferredLanguage = ""
    execution_profile: ExecutionProfileId = "professional"
    locale: str = "pt-BR"
    degraded: bool = False
    has_prompt_master: bool = False
    updated_at: str
    created_at: str


class CreateRoomRequest(ApiModel):
    title: str = "Nova Criacao com IA"
    raw_intent: str = ""
    locale: str = "pt-BR"
    workspace_id: str | None = None
    delivery_type: DeliveryType = "web"
    preferred_language: PreferredLanguage = ""
    execution_profile: ExecutionProfileId = "professional"
    user_model_choice: str | None = None
    use_user_key: bool = False


class PostMessageRequest(ApiModel):
    content: str = Field(min_length=1)
    user_model_choice: str | None = None
    use_user_key: bool = False


class RevisePromptRequest(ApiModel):
    adjustment: str = Field(min_length=1)
    user_model_choice: str | None = None
    use_user_key: bool = False


class LlmActionRequest(ApiModel):
    """Body for actions that may invoke the user's LLM."""

    user_model_choice: str | None = None
    use_user_key: bool = False
    mode: Literal['llm', 'deterministic'] = 'llm'
    provider_override: str | None = None


class ImportPromptMasterRequest(ApiModel):
    format: Literal["markdown", "text", "json"] = "markdown"
    content: str = Field(min_length=1)
    title: str = "PromptMaster importado"
    locale: str = "pt-BR"
    workspace_id: str | None = None
    user_model_choice: str | None = None
    use_user_key: bool = False


class MarkGeneratedRequest(ApiModel):
    generated_project_id: str = Field(min_length=1)


class AcknowledgePreviewRequest(ApiModel):
    """Conscious acceptance of a degraded (deterministic) Blueprint preview."""

    confirmation: str = Field(min_length=1)


class StackApprovalRequest(ApiModel):
    """Stack Approval Gate: approve the proposed stack as-is (empty body) or with
    explicit user overrides ('Alterar stack'). Every provided field replaces the
    blueprint recommendation and is what generation will use."""

    selected_frontend: str | None = None
    selected_backend: str | None = None
    selected_database: str | None = None
    selected_language: str | None = None
    selected_auth: str | None = None
    selected_testing: str | None = None
    selected_deploy_target: str | None = None
    selected_frontend_version: str | None = None
