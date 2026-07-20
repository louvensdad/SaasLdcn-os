from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select

from app.core.database import database_url_for, session_factory
from app.models.workspace_permission_override import WorkspacePermissionOverride


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class WorkspacePermissionRepository:
    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self._sessions = session_factory(self.database_url)

    def get(self, workspace_id: str, action: str, role: str) -> bool | None:
        with self._sessions() as session:
            row = session.get(WorkspacePermissionOverride, (workspace_id, action, role))
            return row.allowed if row is not None else None

    def set(self, workspace_id: str, action: str, role: str, allowed: bool, *, updated_by_user_id: str) -> None:
        with self._sessions.begin() as session:
            row = session.get(WorkspacePermissionOverride, (workspace_id, action, role))
            if row is None:
                session.add(
                    WorkspacePermissionOverride(
                        workspace_id=workspace_id, action=action, role=role, allowed=allowed,
                        updated_by_user_id=updated_by_user_id, updated_at=_now(),
                    )
                )
            else:
                row.allowed = allowed
                row.updated_by_user_id = updated_by_user_id
                row.updated_at = _now()

    def list_for_workspace(self, workspace_id: str) -> list[dict[str, Any]]:
        with self._sessions() as session:
            rows = session.scalars(
                select(WorkspacePermissionOverride).where(WorkspacePermissionOverride.workspace_id == workspace_id)
            ).all()
        return [
            {
                "workspace_id": row.workspace_id, "action": row.action, "role": row.role,
                "allowed": row.allowed, "updated_by_user_id": row.updated_by_user_id, "updated_at": row.updated_at,
            }
            for row in rows
        ]
