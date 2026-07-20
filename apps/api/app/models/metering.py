from __future__ import annotations

from sqlalchemy import Float, Index, PrimaryKeyConstraint, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class MeteringRecord(Base):
    """Immutable consumption event (vault 56 - Monetização e Consumo/Fronteiras
    de billing e recursos.md: "Medição imutável de tokens, CPU, RAM, disco,
    containers, builds e previews" + acceptance criterion "Consumo possui
    origem e unidade"). Never updated or deleted after creation -- a
    correction is a new record, same principle already applied to memories.py
    and evolution_signals.py this session.

    Scope decision (2026-07-20, confirmed with the user): meters only
    resources with real, already-clean owner attribution today (generation
    runs + their LLM tokens, staging deploys, automation runs) -- see
    metering_engine.py's module docstring for the full list of what this
    deliberately does NOT cover yet (CPU/RAM/disk/storage have no existing
    per-owner measurement anywhere in this codebase; adding one is real
    future work, not faked here)."""

    __tablename__ = "metering_records"
    __table_args__ = (
        Index("idx_metering_owner_resource_time", "owner_user_id", "resource_type", "occurred_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    owner_user_id: Mapped[str] = mapped_column(String, nullable=False)
    resource_type: Mapped[str] = mapped_column(String, nullable=False)  # e.g. "llm_tokens" | "generation_run" | "staging_deploy" | "automation_run"
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String, nullable=False)  # e.g. "tokens" | "count"
    origin: Mapped[str] = mapped_column(String, nullable=False)  # e.g. "generation_job:genjob_abc123"
    occurred_at: Mapped[str] = mapped_column(String, nullable=False)


class ResourceEntitlement(Base):
    """A real, configurable quota -- NOT a fabricated pricing tier. Absent a
    row, a resource_type is unlimited by default (confirmed with the user:
    never invent numbers a real pricing decision hasn't set; ship the
    mechanism, default to permissive). Scoped per-owner (not a shared
    "plan" catalog with invented tier names)."""

    __tablename__ = "resource_entitlements"
    __table_args__ = (PrimaryKeyConstraint("owner_user_id", "resource_type"),)

    owner_user_id: Mapped[str] = mapped_column(String, nullable=False)
    resource_type: Mapped[str] = mapped_column(String, nullable=False)
    monthly_limit: Mapped[float] = mapped_column(Float, nullable=False)
    updated_by_user_id: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)
