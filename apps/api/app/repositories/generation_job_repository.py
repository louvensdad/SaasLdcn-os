from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from app.core.config import get_settings


class GenerationJobRepository:
    def __init__(self, sqlite_path: Path | None = None) -> None:
        self.sqlite_path = sqlite_path or get_settings().sqlite_path
        self.initialize()

    @contextmanager
    def connection(self):
        connection = sqlite3.connect(self.sqlite_path, timeout=30)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def initialize(self) -> None:
        with self.connection() as connection:
            connection.execute("""
                CREATE TABLE IF NOT EXISTS generation_jobs (
                    id TEXT PRIMARY KEY,
                    owner_user_id TEXT NOT NULL,
                    project_id TEXT NOT NULL,
                    data_json TEXT NOT NULL,
                    spec_json TEXT NOT NULL,
                    blueprint_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            connection.execute("CREATE INDEX IF NOT EXISTS idx_generation_jobs_owner ON generation_jobs(owner_user_id, updated_at DESC)")

    def create(self, owner_user_id: str, data: dict[str, Any], spec: dict[str, Any], blueprint: dict[str, Any]) -> dict[str, Any]:
        with self.connection() as connection:
            connection.execute(
                "INSERT INTO generation_jobs (id, owner_user_id, project_id, data_json, spec_json, blueprint_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (data["id"], owner_user_id, data["projectId"], self._dump(data), self._dump(spec), self._dump(blueprint), data["createdAt"], data["updatedAt"]),
            )
        return data

    def get(self, job_id: str, owner_user_id: str) -> dict[str, Any] | None:
        with self.connection() as connection:
            row = connection.execute("SELECT * FROM generation_jobs WHERE id = ? AND owner_user_id = ?", (job_id, owner_user_id)).fetchone()
        return self._row(row)

    def latest_for_project(self, project_id: str, owner_user_id: str) -> dict[str, Any] | None:
        with self.connection() as connection:
            row = connection.execute("SELECT * FROM generation_jobs WHERE project_id = ? AND owner_user_id = ? ORDER BY updated_at DESC LIMIT 1", (project_id, owner_user_id)).fetchone()
        return self._row(row)

    def list(self, owner_user_id: str) -> list[dict[str, Any]]:
        with self.connection() as connection:
            rows = connection.execute("SELECT * FROM generation_jobs WHERE owner_user_id = ? ORDER BY updated_at DESC", (owner_user_id,)).fetchall()
        return [self._row(row) for row in rows]

    def update(self, job_id: str, owner_user_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
        with self.connection() as connection:
            result = connection.execute("UPDATE generation_jobs SET data_json = ?, updated_at = ? WHERE id = ? AND owner_user_id = ?", (self._dump(data), data["updatedAt"], job_id, owner_user_id))
        return data if result.rowcount else None

    def inputs(self, job_id: str, owner_user_id: str) -> tuple[dict[str, Any], dict[str, Any]] | None:
        with self.connection() as connection:
            row = connection.execute("SELECT spec_json, blueprint_json FROM generation_jobs WHERE id = ? AND owner_user_id = ?", (job_id, owner_user_id)).fetchone()
        if row is None:
            return None
        return json.loads(row["spec_json"]), json.loads(row["blueprint_json"])

    def _row(self, row: sqlite3.Row | None) -> dict[str, Any] | None:
        return json.loads(row["data_json"]) if row else None

    @staticmethod
    def _dump(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False)
