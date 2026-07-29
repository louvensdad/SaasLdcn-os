from __future__ import annotations

from sqlalchemy import Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class EvolutionSignal(Base):
    """One row per terminal GenerationJob outcome (vault 51 - Engines/
    Especificação dos sete motores.md, Evolution Engine: "aprende com
    feedback, métricas, decisões, regressões e versões para orientar próximas
    mudanças"). Scope confirmed with the user 2026-07-20: consultivo only
    (never changes routing/policy automatically) and owner-scoped only (never
    aggregated across other users/workspaces)."""

    __tablename__ = "evolution_signals"
    __table_args__ = (
        Index("idx_evolution_signal_owner_stack", "owner_user_id", "stack_signature"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    owner_user_id: Mapped[str] = mapped_column(String, nullable=False)
    stack_signature: Mapped[str] = mapped_column(String, nullable=False)
    model_strategy: Mapped[str | None] = mapped_column(String, nullable=True)
    delivery_type: Mapped[str] = mapped_column(String, nullable=False)
    outcome: Mapped[str] = mapped_column(String, nullable=False)  # SUCCESS|DEGRADED_CONTINUATION|NEEDS_USER_ACTION|STALLED|FAILED
    completeness_status: Mapped[str | None] = mapped_column(String, nullable=True)
    repair_cycles: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
