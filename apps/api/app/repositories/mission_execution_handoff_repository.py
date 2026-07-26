from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

from sqlalchemy import select

from app.core.database import database_url_for, session_factory
from app.models.persistence import MissionExecutionHandoff


class MissionExecutionHandoffRepository:
    """One row per Mission (mission_id is unique). Owner-scoped, mirroring
    MissionDeliverableJobRepository's ORM-session pattern and snake_case
    data-dict convention (matches Mission's own, not GenerationJob's
    camelCase)."""

    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self._sessions = session_factory(self.database_url)

    def get_for_mission(self, mission_id: str, owner_user_id: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            row = session.scalar(
                select(MissionExecutionHandoff).where(
                    MissionExecutionHandoff.mission_id == mission_id,
                    MissionExecutionHandoff.owner_user_id == owner_user_id,
                )
            )
            return self._row(row) if row is not None else None

    def get(self, handoff_id: str, owner_user_id: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            row = session.scalar(
                select(MissionExecutionHandoff).where(
                    MissionExecutionHandoff.id == handoff_id,
                    MissionExecutionHandoff.owner_user_id == owner_user_id,
                )
            )
            return self._row(row) if row is not None else None

    def create_or_get(
        self, mission_id: str, owner_user_id: str, build_data: Callable[[], dict[str, Any]]
    ) -> tuple[dict[str, Any], bool]:
        """Single serialized SELECT-then-INSERT transaction -- same
        idempotency pattern as MissionDeliverableJobRepository.create_or_get_idempotent
        (not a DB partial-unique index as the sole guard, for the same
        SQLite-portability reasoning documented there; the mission_id unique
        constraint on this table is a backstop, not the primary mechanism)."""
        with self._sessions.begin() as session:
            row = session.scalar(
                select(MissionExecutionHandoff).where(
                    MissionExecutionHandoff.mission_id == mission_id,
                    MissionExecutionHandoff.owner_user_id == owner_user_id,
                )
            )
            if row is not None:
                return self._row(row), False
            data = build_data()
            session.add(self._to_row(owner_user_id, data))
        return data, True

    def update(self, handoff_id: str, owner_user_id: str, changes: dict[str, Any]) -> dict[str, Any] | None:
        with self._sessions.begin() as session:
            row = session.scalar(
                select(MissionExecutionHandoff).where(
                    MissionExecutionHandoff.id == handoff_id,
                    MissionExecutionHandoff.owner_user_id == owner_user_id,
                )
            )
            if row is None:
                return None
            data = self._row(row)
            data.update(changes)
            data["updated_at"] = self._now()
            row.project_room_id = data.get("project_room_id")
            row.generation_job_id = data.get("generation_job_id")
            row.input_checksum = data["input_checksum"]
            row.status = data["status"]
            row.data_json = self._dumps(data.get("data") or {})
            row.updated_at = data["updated_at"]
            return dict(data)

    def _to_row(self, owner_user_id: str, data: dict[str, Any]) -> MissionExecutionHandoff:
        now = data.get("created_at") or self._now()
        return MissionExecutionHandoff(
            id=data["id"],
            mission_id=data["mission_id"],
            owner_user_id=owner_user_id,
            workspace_id=data.get("workspace_id"),
            deliverable_job_id=data["deliverable_job_id"],
            project_room_id=data.get("project_room_id"),
            generation_job_id=data.get("generation_job_id"),
            input_checksum=data["input_checksum"],
            status=data.get("status") or "PENDING",
            data_json=self._dumps(data.get("data") or {}),
            created_at=now,
            updated_at=data.get("updated_at") or now,
        )

    @classmethod
    def _row(cls, row: MissionExecutionHandoff) -> dict[str, Any]:
        return {
            "id": row.id,
            "mission_id": row.mission_id,
            "owner_user_id": row.owner_user_id,
            "workspace_id": row.workspace_id,
            "deliverable_job_id": row.deliverable_job_id,
            "project_room_id": row.project_room_id,
            "generation_job_id": row.generation_job_id,
            "input_checksum": row.input_checksum,
            "status": row.status,
            "data": json.loads(row.data_json) if row.data_json else {},
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }

    @staticmethod
    def _now() -> str:
        return datetime.now(UTC).replace(microsecond=0).isoformat()

    @staticmethod
    def _dumps(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False)

    @staticmethod
    def new_id() -> str:
        return f"handoff_{uuid4().hex[:14]}"
