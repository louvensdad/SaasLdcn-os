from __future__ import annotations

from sqlalchemy import Boolean, PrimaryKeyConstraint, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class WorkspacePermissionOverride(Base):
    """A workspace's explicit choice for one of the vault matrix's "Configurável"
    cells (57 - Especificações/Matriz de permissões por ação.md) -- e.g. whether
    Developer can publish to production in THIS workspace. Absent a row here,
    app/core/permissions.py's evaluate_permission() defaults to allow (preserves
    pre-existing behavior, confirmed with the user 2026-07-20)."""

    __tablename__ = "workspace_permission_overrides"
    __table_args__ = (PrimaryKeyConstraint("workspace_id", "action", "role"),)

    workspace_id: Mapped[str] = mapped_column(String, nullable=False)
    action: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    allowed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    updated_by_user_id: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)
