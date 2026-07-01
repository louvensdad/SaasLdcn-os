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
    """Per-user, encrypted-at-rest storage for git provider connections and repositories.

    Each row is scoped to a ``user_id`` so every user owns an isolated GitHub/GitLab
    connection (no shared, instance-wide credential). Access tokens are encrypted
    with :func:`app.core.security.encrypt_secret` (Fernet, keyed off
    ``settings.secret_key``) before being written to SQLite, and decrypted on read.
    Plaintext tokens never touch disk.
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
            # Migrate the legacy global schema (PK = provider / repo_key, no user_id)
            # to the per-user schema. The old rows were instance-wide credentials that
            # cannot be attributed to a user, so they are dropped on migration.
            for table in ("git_provider_connections", "git_provider_repositories"):
                if self._table_exists(conn, table) and not self._has_column(conn, table, "user_id"):
                    conn.execute(f"DROP TABLE {table}")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS git_provider_connections (
                    user_id TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    encrypted_token TEXT NOT NULL,
                    profile_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (user_id, provider)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS git_provider_repositories (
                    user_id TEXT NOT NULL,
                    repo_key TEXT NOT NULL,
                    repository_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (user_id, repo_key)
                )
                """
            )

    def save_connection(self, user_id: str, provider: str, token: str, profile: dict[str, Any]) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO git_provider_connections (user_id, provider, encrypted_token, profile_json, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id, provider) DO UPDATE SET
                    encrypted_token = excluded.encrypted_token,
                    profile_json = excluded.profile_json,
                    updated_at = excluded.updated_at
                """,
                (user_id, provider, encrypt_secret(token), json.dumps(profile, ensure_ascii=True, sort_keys=True), now),
            )

    def get_connection(self, user_id: str, provider: str) -> dict[str, Any] | None:
        with self.connection() as conn:
            row = conn.execute(
                "SELECT encrypted_token, profile_json FROM git_provider_connections WHERE user_id = ? AND provider = ?",
                (user_id, provider),
            ).fetchone()
        if row is None:
            return None
        return {
            "token": decrypt_secret(row["encrypted_token"]),
            "profile": json.loads(row["profile_json"]),
        }

    def delete_connection(self, user_id: str, provider: str) -> None:
        with self.connection() as conn:
            conn.execute(
                "DELETE FROM git_provider_connections WHERE user_id = ? AND provider = ?",
                (user_id, provider),
            )

    def save_repository(self, user_id: str, repo_key: str, repository: dict[str, Any]) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO git_provider_repositories (user_id, repo_key, repository_json, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, repo_key) DO UPDATE SET
                    repository_json = excluded.repository_json,
                    updated_at = excluded.updated_at
                """,
                (user_id, repo_key, json.dumps(repository, ensure_ascii=True, sort_keys=True), now),
            )

    def get_repository(self, user_id: str, repo_key: str) -> dict[str, Any] | None:
        with self.connection() as conn:
            row = conn.execute(
                "SELECT repository_json FROM git_provider_repositories WHERE user_id = ? AND repo_key = ?",
                (user_id, repo_key),
            ).fetchone()
        return json.loads(row["repository_json"]) if row else None

    @staticmethod
    def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
        return conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", (name,)
        ).fetchone() is not None

    @staticmethod
    def _has_column(conn: sqlite3.Connection, table: str, column: str) -> bool:
        return any(row["name"] == column for row in conn.execute(f"PRAGMA table_info({table})").fetchall())
