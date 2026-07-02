from __future__ import annotations

import io
import shutil
import zipfile
from pathlib import Path

import pytest
from fastapi import HTTPException

import app.services.generated_project_service as generated_service_module
from app.services.artifact_storage import ArtifactStorageError, S3ArtifactStore
from app.services.file_protocol import EmittedFile
from app.services.generated_project_service import GeneratedProjectService
from app.services.project_writer import ProjectWriter


class MissingObject(Exception):
    def __init__(self) -> None:
        self.response = {"Error": {"Code": "NoSuchKey"}}


class FakeS3:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}
        self.put_calls: list[dict] = []
        self.get_calls: list[tuple[str, str]] = []

    def put_object(self, **kwargs) -> None:
        self.put_calls.append(kwargs)
        self.objects[(kwargs["Bucket"], kwargs["Key"])] = bytes(kwargs["Body"])

    def get_object(self, *, Bucket: str, Key: str) -> dict:
        self.get_calls.append((Bucket, Key))
        try:
            payload = self.objects[(Bucket, Key)]
        except KeyError as exc:
            raise MissingObject() from exc
        return {"Body": io.BytesIO(payload)}


def _store(fake: FakeS3) -> S3ArtifactStore:
    return S3ArtifactStore(bucket="artifacts", prefix="tenant-a", client=fake)


def test_s3_project_snapshot_roundtrip(tmp_path: Path):
    fake = FakeS3()
    store = _store(fake)
    source = tmp_path / "source"
    source.mkdir()
    (source / ".ldcn-generation.json").write_text('{"project_id":"project-a"}', encoding="utf-8")
    (source / "src").mkdir()
    (source / "src" / "main.py").write_text("print('ok')", encoding="utf-8")

    store.save_project("project-a", source)
    restored = tmp_path / "restored"

    assert store.restore_project("project-a", restored) is True
    assert (restored / "src" / "main.py").read_text(encoding="utf-8") == "print('ok')"
    assert fake.put_calls[0]["ServerSideEncryption"] == "AES256"


def test_s3_restore_rejects_path_traversal(tmp_path: Path):
    fake = FakeS3()
    payload = io.BytesIO()
    with zipfile.ZipFile(payload, "w") as archive:
        archive.writestr("../escape.txt", "blocked")
    fake.objects[("artifacts", "tenant-a/projects/project-a.zip")] = payload.getvalue()

    with pytest.raises(ArtifactStorageError, match="unsafe path"):
        _store(fake).restore_project("project-a", tmp_path / "restored")

    assert not (tmp_path / "escape.txt").exists()


def test_project_writer_restores_missing_local_materialization(tmp_path: Path):
    fake = FakeS3()
    store = _store(fake)
    output_root = tmp_path / "active"
    writer = ProjectWriter(output_root=output_root, artifact_store=store)
    result = writer.write(
        [EmittedFile(path="README.md", content="# Durable")],
        project_name="durable",
        owner="user-a",
    )
    shutil.rmtree(result.root_path)

    restored = ProjectWriter(output_root=output_root, artifact_store=store)._project_root(result.project_id)

    assert (restored / "README.md").read_text(encoding="utf-8") == "# Durable"
    assert ProjectWriter(output_root=output_root, artifact_store=store).read_owner(result.project_id) == "user-a"


def test_prepared_download_is_restored_on_another_instance(tmp_path: Path, monkeypatch):
    fake = FakeS3()
    store = _store(fake)
    output_root = tmp_path / "active"
    result = ProjectWriter(output_root=output_root, artifact_store=store).write(
        [EmittedFile(path="README.md", content="# Download")],
        project_name="download",
    )
    download_dir = tmp_path / "downloads"
    monkeypatch.setattr(generated_service_module, "DOWNLOAD_DIR", download_dir)
    service = GeneratedProjectService(artifact_store=store)
    service.workspace_root = tmp_path.resolve()
    project = {"project_id": result.project_id, "generated_project_path": result.root_path}

    service.prepare_download(project)
    local_zip = download_dir / f"{result.project_id}.zip"
    local_zip.unlink()

    assert service.download_path(project) == local_zip
    assert zipfile.is_zipfile(local_zip)


def test_workspace_scoped_save_uses_a_namespaced_key(tmp_path: Path):
    fake = FakeS3()
    store = _store(fake)
    source = tmp_path / "source"
    source.mkdir()
    (source / ".ldcn-generation.json").write_text('{"project_id":"project-a"}', encoding="utf-8")

    store.save_project("project-a", source, workspace_id="ws-1")

    assert fake.put_calls[0]["Key"] == "tenant-a/workspaces/ws-1/projects/project-a.zip"


def test_workspace_scoped_restore_falls_back_to_legacy_flat_key(tmp_path: Path):
    """An artifact written before namespacing existed (flat key, no workspace_id)
    must still be restorable once a caller starts passing a workspace_id."""
    fake = FakeS3()
    store = _store(fake)
    source = tmp_path / "source"
    source.mkdir()
    (source / ".ldcn-generation.json").write_text('{"project_id":"project-a"}', encoding="utf-8")
    store.save_project("project-a", source)  # legacy flat write, no workspace_id

    restored = tmp_path / "restored"
    assert store.restore_project("project-a", restored, workspace_id="ws-1") is True
    assert (restored / ".ldcn-generation.json").is_file()
    # It tried the namespaced key first, then fell back to the flat one.
    assert fake.get_calls == [
        ("artifacts", "tenant-a/workspaces/ws-1/projects/project-a.zip"),
        ("artifacts", "tenant-a/projects/project-a.zip"),
    ]


def test_restore_never_writes_outside_workspace(tmp_path: Path):
    fake = FakeS3()
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    service = GeneratedProjectService(artifact_store=_store(fake))
    service.workspace_root = workspace.resolve()

    with pytest.raises(HTTPException) as exc_info:
        service._project_root(
            {
                "project_id": "project-a",
                "generated_project_path": str(tmp_path / "outside"),
            }
        )

    assert exc_info.value.status_code == 400
    assert fake.get_calls == []
