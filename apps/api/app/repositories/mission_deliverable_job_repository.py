from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Callable, Sequence

from sqlalchemy import select, update

from app.core.database import database_url_for, session_factory
from app.models.persistence import MissionDeliverableJob


class MissionDeliverableJobRepository:
    """Owner-scoped persistence for MissionDeliverableJob -- mirrors
    MissionRepository's owner-only scoping (missions aren't shared across a
    workspace's members today), using the SQLAlchemy ORM session pattern
    GenerationJobRepository uses for its own typed-row-plus-blob table.

    The job document (the `data` dicts passed in/out here) uses snake_case
    keys throughout, matching schemas/mission_deliverable_job.py -- unlike
    GenerationJob's camelCase job-document convention, this table embeds
    ArtifactDraft objects verbatim from schemas/mission.py (snake_case), so
    mixing conventions inside one payload would be worse than following it."""

    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self._sessions = session_factory(self.database_url)

    def create(self, owner_user_id: str, data: dict[str, Any]) -> dict[str, Any]:
        with self._sessions.begin() as session:
            session.add(self._to_row(owner_user_id, data))
        return data

    def create_or_get_idempotent(
        self, owner_user_id: str, mission_id: str, idempotency_key: str, build_data: Callable[[], dict[str, Any]]
    ) -> tuple[dict[str, Any], bool]:
        """Single serialized SELECT-then-INSERT transaction -- the sole
        idempotency enforcement point. Not a DB partial-unique index: this
        repo's UserAiKey precedent documents avoiding those because SQLite
        (this app's dev/test default) can't express them reliably; a
        transactional check-then-insert gives the same guarantee for a human
        clicking a button without a cross-dialect migration hazard."""
        with self._sessions.begin() as session:
            row = session.scalar(
                select(MissionDeliverableJob).where(
                    MissionDeliverableJob.mission_id == mission_id,
                    MissionDeliverableJob.owner_user_id == owner_user_id,
                    MissionDeliverableJob.idempotency_key == idempotency_key,
                )
            )
            if row is not None:
                return self._row(row), False
            data = build_data()
            session.add(self._to_row(owner_user_id, data))
        return data, True

    def get(self, job_id: str, owner_user_id: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            row = session.scalar(
                select(MissionDeliverableJob).where(
                    MissionDeliverableJob.id == job_id, MissionDeliverableJob.owner_user_id == owner_user_id
                )
            )
            return self._row(row) if row is not None else None

    def latest_for_mission(self, mission_id: str, owner_user_id: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            row = session.scalar(
                select(MissionDeliverableJob)
                .where(MissionDeliverableJob.mission_id == mission_id, MissionDeliverableJob.owner_user_id == owner_user_id)
                .order_by(MissionDeliverableJob.created_at.desc())
                .limit(1)
            )
            return self._row(row) if row is not None else None

    def update(self, job_id: str, owner_user_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
        with self._sessions.begin() as session:
            result = session.execute(
                update(MissionDeliverableJob)
                .where(MissionDeliverableJob.id == job_id, MissionDeliverableJob.owner_user_id == owner_user_id)
                .values(
                    status=data["status"], error=self._dump(data["error"]) if data.get("error") is not None else None,
                    heartbeat_at=data.get("heartbeat_at"), data_json=self._dump(data),
                    updated_at=data["updated_at"], completed_at=data.get("completed_at"),
                )
            )
            if not result.rowcount:
                return None
        return data

    def heartbeat(self, job_id: str, *, now: str) -> None:
        with self._sessions.begin() as session:
            session.execute(update(MissionDeliverableJob).where(MissionDeliverableJob.id == job_id).values(heartbeat_at=now))

    def stale_jobs(self, *, statuses: Sequence[str], older_than: str) -> list[tuple[str, str]]:
        with self._sessions() as session:
            rows = session.execute(
                select(MissionDeliverableJob.id, MissionDeliverableJob.owner_user_id).where(
                    MissionDeliverableJob.status.in_(list(statuses)),
                    MissionDeliverableJob.heartbeat_at.is_not(None),
                    MissionDeliverableJob.heartbeat_at < older_than,
                )
            ).all()
            return [(str(row[0]), str(row[1])) for row in rows]

    @classmethod
    def _to_row(cls, owner_user_id: str, data: dict[str, Any]) -> MissionDeliverableJob:
        return MissionDeliverableJob(
            id=data["id"], mission_id=data["mission_id"], owner_user_id=owner_user_id,
            workspace_id=data.get("workspace_id"), status=data["status"],
            idempotency_key=data.get("idempotency_key"), heartbeat_at=data.get("heartbeat_at"),
            error=cls._dump(data["error"]) if data.get("error") is not None else None,
            data_json=cls._dump(data), created_at=data["created_at"], updated_at=data["updated_at"],
            completed_at=data.get("completed_at"),
        )

    @classmethod
    def _row(cls, row: MissionDeliverableJob) -> dict[str, Any]:
        return json.loads(row.data_json)

    @staticmethod
    def _dump(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False)

    @staticmethod
    def _now() -> str:
        return datetime.now(UTC).replace(microsecond=0).isoformat()
