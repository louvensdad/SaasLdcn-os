from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.core.database import database_url_for, session_factory
from app.models.memory import Memory


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class MemoryRepository:
    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self._sessions = session_factory(self.database_url)

    def create(
        self, *, owner_user_id: str, scope_type: str, scope_id: str, memory_type: str,
        content: str, origin: str, confidence: float, expires_at: str | None = None,
    ) -> dict[str, Any]:
        now = _now()
        row = Memory(
            id=f"mem_{uuid4().hex[:12]}", owner_user_id=owner_user_id, scope_type=scope_type, scope_id=scope_id,
            memory_type=memory_type, content=content, origin=origin, confidence=confidence,
            expires_at=expires_at, status="active", corrected_from_id=None, created_at=now, updated_at=now,
        )
        with self._sessions.begin() as session:
            session.add(row)
        return self._as_dict(row)

    def get(self, memory_id: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            row = session.get(Memory, memory_id)
            return self._as_dict(row) if row is not None else None

    def list_for_scope(self, owner_user_id: str, scope_type: str, scope_id: str, *, include_inactive: bool = False) -> list[dict[str, Any]]:
        now = _now()
        with self._sessions() as session:
            statement = select(Memory).where(
                Memory.owner_user_id == owner_user_id, Memory.scope_type == scope_type, Memory.scope_id == scope_id,
            )
            if not include_inactive:
                statement = statement.where(Memory.status == "active")
            rows = session.scalars(statement.order_by(Memory.created_at.desc())).all()
        results = [self._as_dict(row) for row in rows]
        if include_inactive:
            return results
        # Expiration is time-based, not a background job -- filtered at read time
        # so a stale expires_at can never linger and be served as still-active.
        return [row for row in results if not row["expires_at"] or row["expires_at"] > now]

    def get_active_by_origin(self, owner_user_id: str, scope_type: str, scope_id: str, origin: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            row = session.scalars(
                select(Memory).where(
                    Memory.owner_user_id == owner_user_id, Memory.scope_type == scope_type,
                    Memory.scope_id == scope_id, Memory.origin == origin, Memory.status == "active",
                )
            ).first()
            return self._as_dict(row) if row is not None else None

    def correct(self, memory_id: str, *, new_content: str) -> dict[str, Any] | None:
        """Never mutates the original row's content -- marks it 'corrected' and
        inserts a NEW active row pointing back at it, so the audit trail always
        shows what was believed before and after (vault: "corrigido sem apagar
        histórico de auditoria")."""
        with self._sessions.begin() as session:
            old = session.get(Memory, memory_id)
            if old is None or old.status != "active":
                return None
            old.status = "corrected"
            old.updated_at = _now()
            new_row = Memory(
                # origin is preserved (not rewritten) so a later automatic
                # re-extraction with the same origin still finds THIS row via
                # get_active_by_origin() -- corrected_from_id alone carries the
                # lineage pointer, not the origin string.
                id=f"mem_{uuid4().hex[:12]}", owner_user_id=old.owner_user_id, scope_type=old.scope_type,
                scope_id=old.scope_id, memory_type=old.memory_type, content=new_content,
                origin=old.origin, confidence=old.confidence, expires_at=old.expires_at,
                status="active", corrected_from_id=old.id, created_at=_now(), updated_at=_now(),
            )
            session.add(new_row)
            session.flush()
            return self._as_dict(new_row)

    def soft_delete(self, memory_id: str) -> dict[str, Any] | None:
        with self._sessions.begin() as session:
            row = session.get(Memory, memory_id)
            if row is None or row.status == "deleted":
                return None
            row.status = "deleted"
            row.updated_at = _now()
            session.flush()
            return self._as_dict(row)

    @staticmethod
    def _as_dict(row: Memory) -> dict[str, Any]:
        return {
            "id": row.id, "owner_user_id": row.owner_user_id, "scope_type": row.scope_type, "scope_id": row.scope_id,
            "memory_type": row.memory_type, "content": row.content, "origin": row.origin, "confidence": row.confidence,
            "expires_at": row.expires_at, "status": row.status, "corrected_from_id": row.corrected_from_id,
            "created_at": row.created_at, "updated_at": row.updated_at,
        }
