from __future__ import annotations

from sqlalchemy import Float, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class LlmDecisionTrace(Base):
    """One row per LLM router call explaining WHY that model/agent was chosen
    (vault 65 - Observabilidade de IA/Observabilidade de decisões da IA.md).
    Companion to LlmUsageRecord (llm_usage_records), not a replacement -- this
    is the decision/explainability shape, that one is the aggregate-stats shape.

    Never stores prompt content (system/user text): only routing metadata, so
    this satisfies the vault's "conteúdo sensível deve ser mascarado" without
    needing a redaction pass. `confidence` is deliberately absent -- no
    provider returns one, and the codebase's established policy (see
    estimate_cost_usd's 0.0-for-unknown-pricing) is to omit what isn't real
    rather than invent a number."""

    __tablename__ = "llm_decision_traces"
    __table_args__ = (
        Index("idx_llm_decision_created_at", "created_at"),
        Index("idx_llm_decision_project_id", "project_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    provider: Mapped[str] = mapped_column(String, nullable=False)
    model: Mapped[str] = mapped_column(String, nullable=False)
    agent_role: Mapped[str | None] = mapped_column(String, nullable=True)
    model_strategy: Mapped[str | None] = mapped_column(String, nullable=True)
    # Which resolve_model_detailed() branch actually fired: user_choice |
    # profile_override | role_hint | default.
    selection_policy: Mapped[str] = mapped_column(String, nullable=False)
    # JSON-encoded list[{"policy": str, "model": str}] -- the real losing
    # candidates at resolution time, not a synthetic "what-if" simulation.
    alternatives_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]", server_default="[]")
    # JSON-encoded list[str] of caller-declared context labels (e.g.
    # "project_memory"). Opt-in per call site -- never inferred by scanning
    # prompt text, which would be guessing rather than reporting a fact.
    context_used_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]", server_default="[]")
    project_id: Mapped[str | None] = mapped_column(String, nullable=True)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    estimated_cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
