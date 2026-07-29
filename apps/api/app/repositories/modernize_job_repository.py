from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import database_url_for, session_factory
from app.models.persistence import ModernizeJob
from app.repositories.redaction import redact_value


class ModernizeJobRepository:
    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self.sqlite_path = database if isinstance(database, Path) else get_settings().sqlite_path
        self._sessions = session_factory(self.database_url)

    def create(self, *, owner_user_id: str, project_id: str, data: dict[str, Any]) -> dict[str, Any]:
        now = self._now()
        payload = json.dumps(redact_value(data), ensure_ascii=False)
        with self._sessions.begin() as session:
            model = session.get(ModernizeJob, project_id)
            if model is None:
                session.add(ModernizeJob(project_id=project_id, owner_user_id=owner_user_id, data_json=payload, created_at=now, updated_at=now))
            else:
                model.owner_user_id = owner_user_id
                model.data_json = payload
                model.updated_at = now
        return data

    def get_for_owner(self, project_id: str, owner_user_id: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            row = session.scalar(select(ModernizeJob).where(ModernizeJob.project_id == project_id, ModernizeJob.owner_user_id == owner_user_id))
            return json.loads(row.data_json) if row else None

    def latest_for_owner(self, owner_user_id: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            row = session.scalar(select(ModernizeJob).where(ModernizeJob.owner_user_id == owner_user_id).order_by(ModernizeJob.updated_at.desc(), ModernizeJob.created_at.desc()).limit(1))
            return self._record(row)

    def list_for_owner(self, owner_user_id: str, limit: int = 20) -> list[dict[str, Any]]:
        with self._sessions() as session:
            rows = session.scalars(select(ModernizeJob).where(ModernizeJob.owner_user_id == owner_user_id).order_by(ModernizeJob.updated_at.desc(), ModernizeJob.created_at.desc()).limit(int(limit))).all()
            return [self._record(row) for row in rows]

    def update(self, project_id: str, owner_user_id: str, changes: dict[str, Any]) -> dict[str, Any] | None:
        with self._sessions.begin() as session:
            row = session.scalar(select(ModernizeJob).where(ModernizeJob.project_id == project_id, ModernizeJob.owner_user_id == owner_user_id))
            if row is None:
                return None
            data = json.loads(row.data_json)
            data.update(changes)
            row.data_json = json.dumps(redact_value(data), ensure_ascii=False)
            row.updated_at = self._now()
            return data

    def delete_for_owner(self, project_id: str, owner_user_id: str) -> bool:
        with self._sessions.begin() as session:
            row = session.scalar(select(ModernizeJob).where(ModernizeJob.project_id == project_id, ModernizeJob.owner_user_id == owner_user_id))
            if row is None:
                return False
            session.delete(row)
        return True

    @staticmethod
    def _record(row: ModernizeJob | None) -> dict[str, Any] | None:
        if row is None:
            return None
        return {"project_id": row.project_id, "data": json.loads(row.data_json), "created_at": row.created_at, "updated_at": row.updated_at}

    @staticmethod
    def _now() -> str:
        return datetime.now(UTC).replace(microsecond=0).isoformat()