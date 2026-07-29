from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.database import database_url_for, session_factory
from app.models.staging_deployment import StagingDeployment


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class StagingDeploymentRepository:
    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self._sessions = session_factory(self.database_url)

    def get_for_owner(self, project_id: str, owner_user_id: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            row = session.get(StagingDeployment, project_id)
            if row is None or row.owner_user_id != owner_user_id:
                return None
            return self._as_dict(row)

    def upsert(
        self, project_id: str, owner_user_id: str, *, current_version_id: str | None, current_snapshot_path: str | None,
        previous_version_id: str | None, previous_snapshot_path: str | None, status: str, reason: str = "",
    ) -> dict[str, Any]:
        now = _now()
        with self._sessions.begin() as session:
            row = session.get(StagingDeployment, project_id)
            if row is None:
                row = StagingDeployment(project_id=project_id, owner_user_id=owner_user_id, created_at=now, updated_at=now)
                session.add(row)
            row.current_version_id = current_version_id
            row.current_snapshot_path = current_snapshot_path
            row.previous_version_id = previous_version_id
            row.previous_snapshot_path = previous_snapshot_path
            row.status = status
            row.reason = reason
            row.updated_at = now
            session.flush()
            return self._as_dict(row)

    def set_status(self, project_id: str, status: str, reason: str = "") -> dict[str, Any] | None:
        with self._sessions.begin() as session:
            row = session.get(StagingDeployment, project_id)
            if row is None:
                return None
            row.status = status
            row.reason = reason
            row.updated_at = _now()
            session.flush()
            return self._as_dict(row)

    @staticmethod
    def _as_dict(row: StagingDeployment) -> dict[str, Any]:
        return {
            "project_id": row.project_id, "owner_user_id": row.owner_user_id,
            "current_version_id": row.current_version_id, "current_snapshot_path": row.current_snapshot_path,
            "previous_version_id": row.previous_version_id, "previous_snapshot_path": row.previous_snapshot_path,
            "status": row.status, "reason": row.reason, "created_at": row.created_at, "updated_at": row.updated_at,
        }
