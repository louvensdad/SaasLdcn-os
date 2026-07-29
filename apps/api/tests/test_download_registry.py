from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.core.database import Base, get_engine
from app.repositories.download_repository import DownloadRepository
from app.services.download_service import DownloadService


def test_download_registry_is_owner_scoped_and_auditable(tmp_path) -> None:
    database_path = tmp_path / "downloads.db"
    Base.metadata.create_all(bind=get_engine(f"sqlite:///{database_path.as_posix()}"))
    repository = DownloadRepository(database_path)
    service = DownloadService(repository)
    archive = tmp_path / "project.zip"
    archive.write_bytes(b"safe archive")

    record = service.record_prepared(
        {"project_id": "project-1", "owner_user_id": "user-1", "workspace_id": "workspace-1"},
        archive,
        download_url="/api/generation/project-1/download",
    )

    assert service.list_downloads("user-2") == []
    listed = service.list_downloads("user-1")
    assert len(listed) == 1
    assert listed[0]["download_id"] == record["download_id"]
    assert listed[0]["artifact_id"] == "downloads/project-1.zip"
    assert listed[0]["download_url"] == "/api/generation/project-1/download"
    assert listed[0]["checksum_sha256"] == "3235d9c7f811a4af79c2d775bfbe230977967318c96bbf2d2c81c9ae12b5a383"
    assert listed[0]["size_bytes"] == len(b"safe archive")
    assert "tmp_path" not in str(listed[0])

    assert service.mark_downloaded("project-1", "user-2") is False
    assert service.mark_downloaded("project-1", "user-1") is True
    consumed = service.list_downloads("user-1")[0]
    assert consumed["status"] == "downloaded"
    assert consumed["downloaded_at"] is not None


def test_expired_preparation_is_reported_and_cannot_be_consumed(tmp_path) -> None:
    database_path = tmp_path / "expired.db"
    Base.metadata.create_all(bind=get_engine(f"sqlite:///{database_path.as_posix()}"))
    repository = DownloadRepository(database_path)
    now = datetime.now(UTC).replace(microsecond=0)
    repository.record({
        "download_id": "download-expired",
        "project_id": "project-expired",
        "owner_user_id": "user-1",
        "workspace_id": None,
        "status": "prepared",
        "artifact_id": "downloads/project-expired.zip",
        "download_url": "/api/generation/project-expired/download",
        "checksum_sha256": "0" * 64,
        "size_bytes": 1,
        "created_at": (now - timedelta(days=2)).isoformat(),
        "expires_at": (now - timedelta(days=1)).isoformat(),
        "downloaded_at": None,
    })

    service = DownloadService(repository)
    assert service.list_downloads("user-1")[0]["status"] == "expired"
    assert service.mark_downloaded("project-expired", "user-1") is False


def test_downloads_endpoint_uses_authenticated_owner(client) -> None:
    response = client.get("/api/downloads")
    assert response.status_code == 200
    assert response.json() == []