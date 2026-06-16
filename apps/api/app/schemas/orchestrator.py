from __future__ import annotations

from pydantic import BaseModel, Field


class ClarifyingQuestion(BaseModel):
    """A question the Orchestrator asks the user when the intent is ambiguous."""

    id: str
    question: str
    why_it_matters: str
    default_if_skipped: str  # never blank — the assumed value if the user does not answer


class Assumption(BaseModel):
    """A decision the Orchestrator made because the user input was silent on it.

    Materializing assumptions instead of inventing requirements silently is the
    core fix for diagnosis error #1 (idea -> spec).
    """

    field: str
    assumed_value: str
    reason: str  # traceability: business rules are priority zero


class SuggestedStack(BaseModel):
    language: str = ""
    language_reason: str = ""
    runtime: str = ""
    framework: str = ""
    framework_reason: str = ""
    architecture: str = ""
    architecture_reason: str = ""


class ProjectSpec(BaseModel):
    """Structured output of the Orchestrator & Prompt Engineer module (PASSO 2).

    This is the typed contract that downstream agents depend on. It is the
    deterministic boundary between natural-language intent and code generation.
    """

    raw_intent: str  # original user text, preserved verbatim
    product_summary: str = ""
    target_users: list[str] = Field(default_factory=list)
    business_rules: list[str] = Field(default_factory=list)  # feeds the traceability matrix
    entities: list[str] = Field(default_factory=list)
    core_workflows: list[str] = Field(default_factory=list)
    non_functional: dict[str, str] = Field(default_factory=dict)  # perf, security, scale, compliance
    suggested_stack: SuggestedStack = Field(default_factory=SuggestedStack)
    locale: str = "pt-BR"
    assumptions: list[Assumption] = Field(default_factory=list)
    open_questions: list[ClarifyingQuestion] = Field(default_factory=list)
    confidence: float = 0.0  # 0..1 — gate for skipping the CLARIFY stage


class OrchestratorResult(BaseModel):
    """What the orchestrator engine returns to the route/UI each turn."""

    stage: str  # "CLARIFY" | "READY_TO_COMPILE"
    spec: ProjectSpec
    open_questions: list[ClarifyingQuestion] = Field(default_factory=list)
