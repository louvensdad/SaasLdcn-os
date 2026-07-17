from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import delete, update
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.core.database import database_url_for, session_factory
from app.models.user_preferences import LlmActiveSelection


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class LlmActiveSelectionRepository:
    """DB-backed replacement for LlmSettingsService's old in-memory
    `dict[str, _Selection]` -- the active provider/model must survive a
    backend restart, the same way every other user preference does."""

    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self._sessions = session_factory(self.database_url)

    def get(self, user_id: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            model = session.get(LlmActiveSelection, user_id)
            if model is None:
                return None
            return {
                "provider": model.provider,
                "model": model.model,
                "validation_status": model.validation_status,
                "last_validated_at": model.last_validated_at,
                "last_used_at": model.last_used_at,
            }

    def set_if_absent(self, user_id: str, *, provider: str, model: str) -> None:
        insert = sqlite_insert if self.database_url.startswith("sqlite") else postgresql_insert
        with self._sessions.begin() as session:
            stmt = insert(LlmActiveSelection).values(
                user_id=user_id, provider=provider, model=model, validation_status="ready",
            )
            stmt = stmt.on_conflict_do_nothing(index_elements=[LlmActiveSelection.user_id])
            session.execute(stmt)

    def select(self, user_id: str, *, provider: str, model: str) -> None:
        insert = sqlite_insert if self.database_url.startswith("sqlite") else postgresql_insert
        with self._sessions.begin() as session:
            stmt = insert(LlmActiveSelection).values(
                user_id=user_id, provider=provider, model=model, validation_status="ready",
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[LlmActiveSelection.user_id],
                set_={"provider": provider, "model": model, "validation_status": "ready"},
            )
            session.execute(stmt)

    def mark_validated(self, user_id: str, provider: str, *, ok: bool) -> None:
        with self._sessions.begin() as session:
            session.execute(
                update(LlmActiveSelection)
                .where(LlmActiveSelection.user_id == user_id, LlmActiveSelection.provider == provider)
                .values(validation_status="ready" if ok else "invalid", last_validated_at=_now())
            )

    def mark_used(self, user_id: str, provider: str) -> None:
        with self._sessions.begin() as session:
            session.execute(
                update(LlmActiveSelection)
                .where(LlmActiveSelection.user_id == user_id, LlmActiveSelection.provider == provider)
                .values(last_used_at=_now())
            )

    def remove(self, user_id: str, provider: str | None) -> None:
        with self._sessions.begin() as session:
            query = delete(LlmActiveSelection).where(LlmActiveSelection.user_id == user_id)
            if provider is not None:
                query = query.where(LlmActiveSelection.provider == provider)
            session.execute(query)
