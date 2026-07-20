from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class StagingDeployment(Base):
    """Bookkeeping for the "Staging: ambiente persistente para aprovação"
    environment (vault 60 - Publicação/Estratégia de publicação.md). Only
    metadata is persisted here -- the actual running backend/frontend
    processes are in-memory only (same limitation as live_preview_service.py,
    since both are HostExecutionRuntime-based and dev/local-only for now; see
    staging_service.py's module docstring). One row per project: staging is
    not multi-environment in this v1."""

    __tablename__ = "staging_deployments"

    project_id: Mapped[str] = mapped_column(String, primary_key=True)
    owner_user_id: Mapped[str] = mapped_column(String, nullable=False)
    current_version_id: Mapped[str | None] = mapped_column(String, nullable=True)
    current_snapshot_path: Mapped[str | None] = mapped_column(String, nullable=True)
    previous_version_id: Mapped[str | None] = mapped_column(String, nullable=True)
    previous_snapshot_path: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="stopped")  # stopped|running|failed
    reason: Mapped[str] = mapped_column(String, nullable=False, default="")
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)
