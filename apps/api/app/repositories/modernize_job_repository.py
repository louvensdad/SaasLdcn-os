from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.repositories.redaction import redact_value


# Persists the Modernize pipeline job (report / plan / approval / materialized id /
# scores) in SQLite so it survives a process restart — replacing the previous
# in-memory dict. Owner-scoped: a foreign owner resolves to None (-> 404 at the route).
# The whole job is stored as one JSON blob (the shapes evolve together).


class ModernizeJobRepository:
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
                CREATE TABLE IF NOT EXISTS modernize_jobs (
                    project_id TEXT PRIMARY KEY,
                    owner_user_id TEXT NOT NULL,
                    data_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_modernize_jobs_owner ON modernize_jobs(owner_user_id)"
            )

    def create(self, *, owner_user_id: str, project_id: str, data: dict[str, Any]) -> dict[str, Any]:
        now = self._now()
        with self.connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO modernize_jobs (project_id, owner_user_id, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (project_id, owner_user_id, json.dumps(redact_value(data), ensure_ascii=False), now, now),
            )
        return data

    def get_for_owner(self, project_id: str, owner_user_id: str) -> dict[str, Any] | None:
        with self.connection() as conn:
            row = conn.execute(
                "SELECT data_json FROM modernize_jobs WHERE project_id = ? AND owner_user_id = ?",
                (project_id, owner_user_id),
            ).fetchone()
        return json.loads(row["data_json"]) if row else None

    def latest_for_owner(self, owner_user_id: str) -> dict[str, Any] | None:
        """Most recently touched job for the owner (so Auto-Fix can open the last
        analysis without re-uploading). Returns {project_id, data, created_at,
        updated_at} or None when the user has no analyses yet."""
        with self.connection() as conn:
            row = conn.execute(
                "SELECT project_id, data_json, created_at, updated_at FROM modernize_jobs "
                "WHERE owner_user_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1",
                (owner_user_id,),
            ).fetchone()
        if row is None:
            return None
        return {
            "project_id": row["project_id"],
            "data": json.loads(row["data_json"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def list_for_owner(self, owner_user_id: str, limit: int = 20) -> list[dict[str, Any]]:
        """Recent jobs for the owner, newest first (analysis picker / history)."""
        with self.connection() as conn:
            rows = conn.execute(
                "SELECT project_id, data_json, created_at, updated_at FROM modernize_jobs "
                "WHERE owner_user_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT ?",
                (owner_user_id, int(limit)),
            ).fetchall()
        return [
            {
                "project_id": row["project_id"],
                "data": json.loads(row["data_json"]),
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }
            for row in rows
        ]

    def update(self, project_id: str, owner_user_id: str, changes: dict[str, Any]) -> dict[str, Any] | None:
        data = self.get_for_owner(project_id, owner_user_id)
        if data is None:
            return None
        data.update(changes)
        with self.connection() as conn:
            result = conn.execute(
                "UPDATE modernize_jobs SET data_json = ?, updated_at = ? WHERE project_id = ? AND owner_user_id = ?",
                (json.dumps(redact_value(data), ensure_ascii=False), self._now(), project_id, owner_user_id),
            )
            if result.rowcount == 0:
                return None
        return data

    @staticmethod
    def _now() -> str:
        return datetime.now(UTC).replace(microsecond=0).isoformat()
