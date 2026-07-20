from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.core.database import database_url_for, session_factory
from app.models.feature import Feature

_LIST_FIELDS = ("target_users", "scope", "acceptance_criteria", "dependencies", "metrics", "risks")


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class FeatureRepository:
    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self._sessions = session_factory(self.database_url)

    def create(
        self, *, owner_user_id: str, project_id: str, title: str, workspace_id: str | None = None,
        problem: str = "", objective: str = "", target_users: list[str] | None = None,
        scope: list[str] | None = None, acceptance_criteria: list[str] | None = None,
        dependencies: list[str] | None = None, metrics: list[str] | None = None,
        risks: list[str] | None = None, priority: str = "medium", target_version: str | None = None,
    ) -> dict[str, Any]:
        now = _now()
        row = Feature(
            id=f"feat_{uuid4().hex[:12]}", owner_user_id=owner_user_id, workspace_id=workspace_id,
            project_id=project_id, title=title, problem=problem, objective=objective,
            target_users_json=json.dumps(target_users or [], ensure_ascii=False),
            scope_json=json.dumps(scope or [], ensure_ascii=False),
            acceptance_criteria_json=json.dumps(acceptance_criteria or [], ensure_ascii=False),
            dependencies_json=json.dumps(dependencies or [], ensure_ascii=False),
            metrics_json=json.dumps(metrics or [], ensure_ascii=False),
            risks_json=json.dumps(risks or [], ensure_ascii=False),
            priority=priority, target_version=target_version, status="Proposed",
            created_at=now, updated_at=now,
        )
        with self._sessions.begin() as session:
            session.add(row)
        return self._as_dict(row)

    def get_for_owner(self, feature_id: str, owner_user_id: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            row = session.get(Feature, feature_id)
            if row is None or row.owner_user_id != owner_user_id:
                return None
            return self._as_dict(row)

    def list_for_project(self, project_id: str, owner_user_id: str) -> list[dict[str, Any]]:
        with self._sessions() as session:
            rows = session.scalars(
                select(Feature).where(Feature.project_id == project_id, Feature.owner_user_id == owner_user_id)
                .order_by(Feature.created_at.desc())
            ).all()
        return [self._as_dict(row) for row in rows]

    def set_status(self, feature_id: str, owner_user_id: str, status: str) -> dict[str, Any] | None:
        with self._sessions.begin() as session:
            row = session.get(Feature, feature_id)
            if row is None or row.owner_user_id != owner_user_id:
                return None
            row.status = status
            row.updated_at = _now()
            session.flush()
            return self._as_dict(row)

    def delete_for_owner(self, feature_id: str, owner_user_id: str) -> bool:
        with self._sessions.begin() as session:
            row = session.get(Feature, feature_id)
            if row is None or row.owner_user_id != owner_user_id:
                return False
            session.delete(row)
            return True

    @staticmethod
    def _as_dict(row: Feature) -> dict[str, Any]:
        data = {
            "id": row.id, "owner_user_id": row.owner_user_id, "workspace_id": row.workspace_id,
            "project_id": row.project_id, "title": row.title, "problem": row.problem, "objective": row.objective,
            "priority": row.priority, "target_version": row.target_version, "status": row.status,
            "created_at": row.created_at, "updated_at": row.updated_at,
        }
        for field in _LIST_FIELDS:
            data[field] = json.loads(getattr(row, f"{field}_json") or "[]")
        return data
