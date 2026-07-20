from __future__ import annotations

from pydantic import BaseModel


class DecisionAlternative(BaseModel):
    policy: str
    model: str


class LlmDecisionTrace(BaseModel):
    """Explains one real router decision (vault 65 - Observabilidade de IA):
    which model won, which rule fired, and what real candidates it beat.
    `confidence` is intentionally absent -- no provider returns one, and this
    codebase's policy is to omit unknown data rather than invent it."""

    id: str
    provider: str
    model: str
    agent_role: str | None = None
    model_strategy: str | None = None
    selection_policy: str
    alternatives: list[DecisionAlternative] = []
    context_used: list[str] = []
    project_id: str | None = None
    input_tokens: int
    output_tokens: int
    latency_ms: int
    estimated_cost_usd: float
    created_at: str
