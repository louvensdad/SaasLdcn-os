from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Callable

from sqlalchemy import func, select, update

from app.core.database import database_url_for, session_factory
from app.models.persistence import GenerationNotification


class GenerationNotificationRepository:
    """Owner-scoped persistence for GenerationNotification. Idempotency is a
    single serialized SELECT-then-INSERT transaction (not a DB partial-unique
    index -- see MissionDeliverableJobRepository.create_or_get_idempotent for
    the identical pattern and its rationale)."""

    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self._sessions = session_factory(self.database_url)

    def rebind(self, database: str | Path | None) -> None:
        """Repoint this module-level singleton at a different database --
        used by tests to isolate each run onto its own per-test SQLite file
        without every importer needing to re-import a fresh instance (both
        app/routes/generation_notifications.py and generation_job_engine.py
        hold a reference to the same singleton object)."""
        self.database_url = database_url_for(database)
        self._sessions = session_factory(self.database_url)

    def create_or_get_idempotent(
        self, user_id: str, job_id: str, idempotency_key: str, build_data: Callable[[], dict[str, Any]]
    ) -> tuple[dict[str, Any], bool]:
        with self._sessions.begin() as session:
            row = session.scalar(
                select(GenerationNotification).where(
                    GenerationNotification.job_id == job_id,
                    GenerationNotification.user_id == user_id,
                    GenerationNotification.idempotency_key == idempotency_key,
                )
            )
            if row is not None:
                return self._row(row), False
            data = build_data()
            session.add(self._to_row(data))
        return data, True

    def list_for_user(
        self, user_id: str, *, read: bool | None = None, entity_type: str | None = None,
        before: tuple[str, str] | None = None, limit: int = 20,
    ) -> tuple[list[dict[str, Any]], bool]:
        """Keyset-paginated, newest first. `before` is (created_at, id) of the
        last row already seen; returns (items, has_more). `entity_type` is an
        optional filter (Phase 2) -- omitted, it returns every subject type
        for this user, matching today's GenerationJob-only behavior exactly."""
        with self._sessions() as session:
            stmt = select(GenerationNotification).where(GenerationNotification.user_id == user_id)
            if read is not None:
                stmt = stmt.where(GenerationNotification.read == read)
            if entity_type is not None:
                stmt = stmt.where(GenerationNotification.entity_type == entity_type)
            if before is not None:
                created_at, notif_id = before
                stmt = stmt.where(
                    (GenerationNotification.created_at < created_at)
                    | ((GenerationNotification.created_at == created_at) & (GenerationNotification.id < notif_id))
                )
            stmt = stmt.order_by(GenerationNotification.created_at.desc(), GenerationNotification.id.desc()).limit(limit + 1)
            rows = session.scalars(stmt).all()
            has_more = len(rows) > limit
            return [self._row(row) for row in rows[:limit]], has_more

    def unread_count(self, user_id: str) -> int:
        with self._sessions() as session:
            total = session.scalar(
                select(func.count()).select_from(GenerationNotification).where(
                    GenerationNotification.user_id == user_id, GenerationNotification.read.is_(False)
                )
            )
            return int(total or 0)

    def mark_read(self, notification_id: str, user_id: str) -> dict[str, Any] | None:
        with self._sessions.begin() as session:
            result = session.execute(
                update(GenerationNotification)
                .where(GenerationNotification.id == notification_id, GenerationNotification.user_id == user_id)
                .values(read=True)
            )
            if not result.rowcount:
                return None
            row = session.scalar(select(GenerationNotification).where(GenerationNotification.id == notification_id))
            return self._row(row) if row is not None else None

    def mark_all_read(self, user_id: str) -> int:
        with self._sessions.begin() as session:
            result = session.execute(
                update(GenerationNotification)
                .where(GenerationNotification.user_id == user_id, GenerationNotification.read.is_(False))
                .values(read=True)
            )
            return int(result.rowcount or 0)

    def list_new_for_job(
        self, job_id: str, user_id: str, *, since_created_at: str | None, since_id: str | None, limit: int = 50
    ) -> list[dict[str, Any]]:
        """Rows for this job at/after the given cursor (excluding since_id
        itself), ordered oldest-first -- feeds the job SSE route's live
        `notification` frame so a user already watching a job sees new
        notifications over the connection that's already open."""
        with self._sessions() as session:
            stmt = select(GenerationNotification).where(
                GenerationNotification.job_id == job_id, GenerationNotification.user_id == user_id
            )
            if since_created_at is not None:
                if since_id is not None:
                    stmt = stmt.where(
                        (GenerationNotification.created_at > since_created_at)
                        | ((GenerationNotification.created_at == since_created_at) & (GenerationNotification.id > since_id))
                    )
                else:
                    stmt = stmt.where(GenerationNotification.created_at >= since_created_at)
            stmt = stmt.order_by(GenerationNotification.created_at.asc(), GenerationNotification.id.asc()).limit(limit)
            rows = session.scalars(stmt).all()
            return [self._row(row) for row in rows]

    @classmethod
    def _to_row(cls, data: dict[str, Any]) -> GenerationNotification:
        return GenerationNotification(
            id=data["id"], user_id=data["user_id"], workspace_id=data.get("workspace_id"),
            project_id=data.get("project_id"), job_id=data["job_id"],
            entity_type=data.get("entity_type"), entity_id=data.get("entity_id"),
            type=data["type"], severity=data.get("severity", "INFO"), stage=data.get("stage"),
            read=bool(data.get("read", False)), action_url=data.get("action_url"),
            idempotency_key=data["idempotency_key"],
            metadata_json=cls._dump(data.get("metadata") or {}), created_at=data["created_at"],
        )

    @classmethod
    def _row(cls, row: GenerationNotification) -> dict[str, Any]:
        return {
            "id": row.id, "user_id": row.user_id, "workspace_id": row.workspace_id, "project_id": row.project_id,
            "job_id": row.job_id, "entity_type": row.entity_type, "entity_id": row.entity_id,
            "type": row.type, "severity": row.severity, "stage": row.stage, "read": bool(row.read),
            "action_url": row.action_url, "idempotency_key": row.idempotency_key,
            "metadata": json.loads(row.metadata_json or "{}"), "created_at": row.created_at,
        }

    @staticmethod
    def _dump(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False)

    @staticmethod
    def _now() -> str:
        return datetime.now(UTC).replace(microsecond=0).isoformat()


generation_notification_repository = GenerationNotificationRepository()
