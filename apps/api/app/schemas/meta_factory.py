from __future__ import annotations

from pydantic import Field

from app.engines.factory_pipeline import PIPELINE_ORDER
from app.schemas.common import ApiModel
from app.schemas.completeness import CompletenessReport
from app.schemas.generation_validation import GenerationValidationReport
from app.schemas.orchestrator import ClarifyingQuestion, ProjectSpec


class OrchestrateRequest(ApiModel):
    # Bounded to prevent token-cost DoS and to cap the prompt-injection surface that
    # flows into the builder agents (diagnosis H4). 16k chars is ample for an intent.
    raw_intent: str = Field(min_length=1, max_length=16_000)
    prior_answers: list[dict] = Field(default_factory=list, max_length=50)
    # Explicit user decision for the backend language ("" / None = auto). Enforced
    # deterministically onto the resulting spec — never left to the LLM.
    preferred_language: str | None = Field(default=None, max_length=40)
    user_model_choice: str | None = None
    # When true, use the caller's own LLM key (from the ephemeral vault) instead
    # of the server's. A user-key run never silently falls back to the mock.
    use_user_key: bool = False


class OrchestrateResponse(ApiModel):
    stage: str
    spec: ProjectSpec
    open_questions: list[ClarifyingQuestion] = Field(default_factory=list)
    # True when the deterministic MockAdapter served this turn (LLM unavailable).
    degraded: bool = False


class GenerateRequest(ApiModel):
    spec: ProjectSpec
    project_name: str = "meta-factory-project"
    user_model_choice: str | None = None
    persist: bool = True
    use_user_key: bool = False
    # Optional Architect Blueprint (serialized) — appended to the Mega-Prompt so the
    # agents receive PromptMaster + Blueprint, not free text.
    blueprint: dict | None = None


class StageGenerateRequest(ApiModel):
    spec: ProjectSpec
    project_name: str = "meta-factory-project"
    role: str = Field(pattern=f"^({'|'.join(PIPELINE_ORDER)})$")
    project_id: str | None = None
    user_model_choice: str | None = None
    persist: bool = True
    use_user_key: bool = False
    blueprint: dict | None = None


class CompletenessReviewRequest(ApiModel):
    spec: ProjectSpec
    project_id: str
    user_model_choice: str | None = None
    use_user_key: bool = False


class VerifyRequest(ApiModel):
    # The build/auto-repair "sala de teste". The spec gives the repair agent intent.
    spec: ProjectSpec
    user_model_choice: str | None = None
    use_user_key: bool = False


class AgentRunSummary(ApiModel):
    role: str
    model: str
    file_count: int
    stopped_by: str
    errors: list[str] = Field(default_factory=list)


class GenerateResponse(ApiModel):
    ok: bool
    project_id: str | None = None
    root_path: str | None = None
    file_count: int = 0
    written: bool = False
    runs: list[AgentRunSummary] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    # Recoverable issues (territory drift, synthesized manifest) — files still written.
    warnings: list[str] = Field(default_factory=list)
    # True when one or more agents were served by the deterministic MockAdapter.
    degraded: bool = False
    validation_report: GenerationValidationReport | None = None


class CompletenessReviewResponse(CompletenessReport):
    pass
