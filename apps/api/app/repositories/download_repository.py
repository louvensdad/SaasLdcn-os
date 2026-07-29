from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.core.database import connection as database_connection, database_url_for


class DownloadRepository:
    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)

    def record(self, record: dict[str, Any]) -> dict[str, Any]:
        with database_connection(self.database_url) as conn:
            conn.execute(
                """
                INSERT INTO download_records (
                    download_id, project_id, owner_user_id, workspace_id, status,
                    artifact_id, download_url, checksum_sha256, size_bytes, created_at, expires_at, downloaded_at
                ) VALUES (
                    :download_id, :project_id, :owner_user_id, :workspace_id, :status,
                    :artifact_id, :download_url, :checksum_sha256, :size_bytes, :created_at, :expires_at, NULL
                )
                """,
                record,
            )
        return record

    def list_for_owner(self, owner_user_id: str) -> list[dict[str, Any]]:
        now = datetime.now(UTC).replace(microsecond=0).isoformat()
        with database_connection(self.database_url) as conn:
            rows = conn.execute(
                """
                SELECT download_id, project_id, workspace_id,
                       CASE WHEN status = 'prepared' AND expires_at <= :now THEN 'expired' ELSE status END AS status,
                       artifact_id, download_url, checksum_sha256, size_bytes, created_at, expires_at, downloaded_at
                FROM download_records
                WHERE owner_user_id = :owner_user_id
                ORDER BY created_at DESC
                """,
                {"owner_user_id": owner_user_id, "now": now},
            ).fetchall()
        return [dict(row) for row in rows]

    def mark_downloaded(self, project_id: str, owner_user_id: str, downloaded_at: str) -> bool:
        with database_connection(self.database_url) as conn:
            row = conn.execute(
                """
                SELECT download_id FROM download_records
                WHERE project_id = :project_id AND owner_user_id = :owner_user_id
                      AND status IN ('prepared', 'downloaded') AND expires_at > :downloaded_at
                ORDER BY created_at DESC LIMIT 1
                """,
                {"project_id": project_id, "owner_user_id": owner_user_id, "downloaded_at": downloaded_at},
            ).fetchone()
            if row is None:
                return False
            conn.execute(
                """UPDATE download_records SET status = 'downloaded', downloaded_at = :downloaded_at
                   WHERE download_id = :download_id""",
                {"downloaded_at": downloaded_at, "download_id": row["download_id"]},
            )
        return True