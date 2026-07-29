from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status

from app.repositories.download_repository import DownloadRepository

DOWNLOAD_TTL = timedelta(hours=24)


class DownloadService:
    def __init__(self, repository: DownloadRepository | None = None) -> None:
        self.repository = repository or DownloadRepository()

    def record_prepared(self, project: dict[str, Any], archive: Path, *, download_url: str) -> dict[str, Any]:
        now = datetime.now(UTC).replace(microsecond=0)
        project_id = str(project["project_id"])
        record = {
            "download_id": f"download_{uuid4().hex}",
            "project_id": project_id,
            "owner_user_id": str(project["owner_user_id"]),
            "workspace_id": project.get("workspace_id"),
            "status": "prepared",
            "artifact_id": f"downloads/{project_id}.zip",
            "download_url": download_url,
            "checksum_sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
            "size_bytes": archive.stat().st_size,
            "created_at": now.isoformat(),
            "expires_at": (now + DOWNLOAD_TTL).isoformat(),
            "downloaded_at": None,
        }
        return self.repository.record(record)

    def list_downloads(self, owner_user_id: str) -> list[dict[str, Any]]:
        return self.repository.list_for_owner(owner_user_id)

    def mark_downloaded(self, project_id: str, owner_user_id: str) -> bool:
        now = datetime.now(UTC).replace(microsecond=0).isoformat()
        return self.repository.mark_downloaded(project_id, owner_user_id, now)
    def prepare_archive(
        self,
        generated_service: Any,
        project: dict[str, Any],
        *,
        download_url: str,
    ) -> dict[str, Any]:
        result = generated_service.prepare_download(project)
        self.record_prepared(project, generated_service.download_path(project), download_url=download_url)
        return result

    def resolve_archive(self, generated_service: Any, project: dict[str, Any], owner_user_id: str) -> Path:
        archive = generated_service.download_path(project)
        if not self.mark_downloaded(str(project["project_id"]), owner_user_id):
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="Download expired or was not prepared.")
        return archive
