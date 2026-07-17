from __future__ import annotations

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PlatformRuntimeConfig(Base):
    """Single-row platform-wide runtime configuration. Unlike UserPreferences,
    the worker pool / job lease / audit retention are shared process-global
    resources (see app/engines/agent_executor.py) -- there is exactly one row,
    keyed by a fixed id, and only an admin may change it (RequireAdmin on the
    route). Columns are nullable: null means "no override, use the
    LDCN_* environment default from Settings"."""

    __tablename__ = "platform_runtime_config"

    id: Mapped[str] = mapped_column(String, primary_key=True, default="singleton")
    agent_worker_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    generation_job_lease_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    audit_log_retention_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)
