from __future__ import annotations

from sqlalchemy import Float, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Memory(Base):
    """A persisted fact/preference/decision (vault 28 - Contexto/Políticas de
    contexto.md + 54 - Memória e Conhecimento/Fronteiras de memória e
    contexto.md). Never hard-deleted or mutated in place -- "correction" and
    "deletion" are STATUS transitions on a row plus, for correction, a new row
    (see MemoryRepository.correct()), so audit history is never lost
    ("Contexto incorreto pode ser corrigido sem apagar histórico de
    auditoria"). Scope is conversation/project only in this v1 (workspace-wide
    memory deferred -- see evolution_engine.py's owner-scoping precedent for
    why cross-project aggregation is a separate decision, not a default)."""

    __tablename__ = "memories"
    __table_args__ = (
        Index("idx_memory_scope", "scope_type", "scope_id"),
        Index("idx_memory_owner", "owner_user_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    owner_user_id: Mapped[str] = mapped_column(String, nullable=False)
    scope_type: Mapped[str] = mapped_column(String, nullable=False)  # "conversation" | "project"
    scope_id: Mapped[str] = mapped_column(String, nullable=False)  # room_id today
    memory_type: Mapped[str] = mapped_column(String, nullable=False)  # "assumption" | "preference" | "fact" | "refusal" | "hypothesis"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    origin: Mapped[str] = mapped_column(String, nullable=False)  # e.g. "orchestrator_assumption:target_users", "confirmed_answer:refine_1"
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    expires_at: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="active")  # "active" | "corrected" | "deleted"
    corrected_from_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)
