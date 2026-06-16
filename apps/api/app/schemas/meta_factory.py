from __future__ import annotations

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.generation_validation import GenerationValidationReport
from app.schemas.orchestrator import ClarifyingQuestion, ProjectSpec


class OrchestrateRequest(ApiModel):
    raw_intent: str
    prior_answers: list[dict] = Field(default_factory=list)
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
