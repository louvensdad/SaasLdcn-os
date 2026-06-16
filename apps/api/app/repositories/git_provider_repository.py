from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.core.security import decrypt_secret, encrypt_secret


class GitProviderRepository:
    """Persistent, encrypted-at-rest storage for git provider connections and repositories.

    Access tokens are encrypted with :func:`app.core.security.encrypt_secret`
    (Fernet, keyed off ``settings.secret_key``) before being written to SQLite,
    and decrypted on read. Plaintext tokens never touch disk.
    """

    def __init__(self, sqlite_path: Path | None = None) -> None:
        self.sqlite_path = sqlite_path or get_settings().sqlite_path

    @contextmanager
    def connection(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.sqlite_path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def initialize(self) -> None:
        with self.connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS git_provider_connections (
                    provider TEXT PRIMARY KEY,
                    encrypted_token TEXT NOT NULL,
                    profile_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS git_provider_repositories (
                    repo_key TEXT PRIMARY KEY,
                    repository_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

    def save_connection(self, provider: str, token: str, profile: dict[str, Any]) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO git_provider_connections (provider, encrypted_token, profile_json, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(provider) DO UPDATE SET
                    encrypted_token = excluded.encrypted_token,
                    profile_json = excluded.profile_json,
                    updated_at = excluded.updated_at
                """,
                (provider, encrypt_secret(token), json.dumps(profile, ensure_ascii=True, sort_keys=True), now),
            )

    def get_connection(self, provider: str) -> dict[str, Any] | None:
        with self.connection() as conn:
            row = conn.execute(
                "SELECT encrypted_token, profile_json FROM git_provider_connections WHERE provider = ?",
                (provider,),
            ).fetchone()
        if row is None:
            return None
        return {
            "token": decrypt_secret(row["encrypted_token"]),
            "profile": json.loads(row["profile_json"]),
        }

    def delete_connection(self, provider: str) -> None:
        with self.connection() as conn:
            conn.execute("DELETE FROM git_provider_connections WHERE provider = ?", (provider,))

    def save_repository(self, repo_key: str, repository: dict[str, Any]) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO git_provider_repositories (repo_key, repository_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(repo_key) DO UPDATE SET
                    repository_json = excluded.repository_json,
                    updated_at = excluded.updated_at
                """,
                (repo_key, json.dumps(repository, ensure_ascii=True, sort_keys=True), now),
            )

    def get_repository(self, repo_key: str) -> dict[str, Any] | None:
        with self.connection() as conn:
            row = conn.execute(
                "SELECT repository_json FROM git_provider_repositories WHERE repo_key = ?",
                (repo_key,),
            ).fetchone()
        return json.loads(row["repository_json"]) if row else None
