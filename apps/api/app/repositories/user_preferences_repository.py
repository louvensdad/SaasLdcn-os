from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.dialects.postgresql import insert as postgresql_insert

from app.core.database import database_url_for, session_factory
from app.models.user_preferences import UserPreferences


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class UserPreferencesRepository:
    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self._sessions = session_factory(self.database_url)

    def get(self, user_id: str) -> dict[str, str | None] | None:
        with self._sessions() as session:
            model = session.get(UserPreferences, user_id)
            if model is None:
                return None
            return {"interface_json": model.interface_json, "ai_json": model.ai_json, "personal_json": model.personal_json, "git_json": model.git_json, "advanced_json": model.advanced_json, "locale_json": model.locale_json}

    def _upsert(self, user_id: str, column: str, value: str) -> None:
        now = _now()
        insert = sqlite_insert if self.database_url.startswith("sqlite") else postgresql_insert
        with self._sessions.begin() as session:
            stmt = insert(UserPreferences).values(
                user_id=user_id, **{column: value}, updated_at=now
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[UserPreferences.user_id],
                set_={column: value, "updated_at": now},
            )
            session.execute(stmt)

    def set_interface(self, user_id: str, interface_json: str) -> None:
        self._upsert(user_id, "interface_json", interface_json)

    def set_ai(self, user_id: str, ai_json: str) -> None:
        self._upsert(user_id, "ai_json", ai_json)


    def set_personal(self, user_id: str, value: str) -> None:
        self._upsert(user_id, 'personal_json', value)

    def set_git(self, user_id: str, value: str) -> None:
        self._upsert(user_id, 'git_json', value)

    def set_advanced(self, user_id: str, value: str) -> None:
        self._upsert(user_id, 'advanced_json', value)

    def set_locale(self, user_id: str, value: str) -> None:
        self._upsert(user_id, 'locale_json', value)
