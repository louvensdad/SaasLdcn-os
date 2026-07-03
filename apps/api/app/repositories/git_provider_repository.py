from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


from app.core.config import get_settings
from app.core.database import connection as database_connection, database_url_for, session_factory
from app.core.security import decrypt_secret, encrypt_secret
from app.models.persistence import GitProviderConnection, GitProviderRepositoryRecord


class GitProviderRepository:
    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self.sqlite_path = database if isinstance(database, Path) else get_settings().sqlite_path
        self._sessions = session_factory(self.database_url)

    def connection(self):
        return database_connection(self.database_url)

    def save_connection(self, user_id: str, provider: str, token: str, profile: dict[str, Any]) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._sessions.begin() as session:
            model = session.get(GitProviderConnection, (user_id, provider))
            if model is None:
                session.add(GitProviderConnection(user_id=user_id, provider=provider, encrypted_token=encrypt_secret(token), profile_json=json.dumps(profile, ensure_ascii=True, sort_keys=True), updated_at=now))
            else:
                model.encrypted_token = encrypt_secret(token)
                model.profile_json = json.dumps(profile, ensure_ascii=True, sort_keys=True)
                model.updated_at = now

    def get_connection(self, user_id: str, provider: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            model = session.get(GitProviderConnection, (user_id, provider))
            return {"token": decrypt_secret(model.encrypted_token), "profile": json.loads(model.profile_json)} if model else None

    def delete_connection(self, user_id: str, provider: str) -> None:
        with self._sessions.begin() as session:
            model = session.get(GitProviderConnection, (user_id, provider))
            if model is not None:
                session.delete(model)

    def save_repository(self, user_id: str, repo_key: str, repository: dict[str, Any]) -> None:
        now = datetime.now(timezone.utc).isoformat()
        payload = json.dumps(repository, ensure_ascii=True, sort_keys=True)
        with self._sessions.begin() as session:
            model = session.get(GitProviderRepositoryRecord, (user_id, repo_key))
            if model is None:
                session.add(GitProviderRepositoryRecord(user_id=user_id, repo_key=repo_key, repository_json=payload, updated_at=now))
            else:
                model.repository_json = payload
                model.updated_at = now

    def get_repository(self, user_id: str, repo_key: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            model = session.get(GitProviderRepositoryRecord, (user_id, repo_key))
            return json.loads(model.repository_json) if model else None