from __future__ import annotations

import io
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Protocol

from app.core.config import Settings, get_settings
from app.core.exceptions import ServiceUnavailableError


class ArtifactStorageError(ServiceUnavailableError):
    """Raised when durable artifact storage cannot complete an operation."""

    def __init__(self, message: str) -> None:
        super().__init__("artifact_storage_unavailable", message, retry_after=5)


class ArtifactStore(Protocol):
    def save_project(self, project_id: str, root: Path, *, workspace_id: str | None = None) -> None: ...
    def restore_project(self, project_id: str, destination: Path, *, workspace_id: str | None = None) -> bool: ...
    def save_download(self, project_id: str, zip_path: Path, *, workspace_id: str | None = None) -> None: ...
    def restore_download(self, project_id: str, destination: Path, *, workspace_id: str | None = None) -> bool: ...


class LocalArtifactStore:
    """Development backend: the existing filesystem remains the source of truth."""

    def save_project(self, project_id: str, root: Path, *, workspace_id: str | None = None) -> None:
        del project_id, root, workspace_id

    def restore_project(self, project_id: str, destination: Path, *, workspace_id: str | None = None) -> bool:
        del project_id, destination, workspace_id
        return False

    def save_download(self, project_id: str, zip_path: Path, *, workspace_id: str | None = None) -> None:
        del project_id, zip_path, workspace_id

    def restore_download(self, project_id: str, destination: Path, *, workspace_id: str | None = None) -> bool:
        del project_id, destination, workspace_id
        return False


class S3ArtifactStore:
    """S3-compatible storage for project snapshots and prepared downloads."""

    def __init__(
        self,
        *,
        bucket: str,
        prefix: str = "ldcn-artifacts",
        client: Any | None = None,
        endpoint_url: str | None = None,
        region_name: str | None = None,
    ) -> None:
        if not bucket.strip():
            raise ValueError("Artifact bucket is required.")
        if client is None:
            import boto3

            client = boto3.client(
                "s3",
                endpoint_url=endpoint_url or None,
                region_name=region_name or None,
            )
        self._client = client
        self.bucket = bucket.strip()
        self.prefix = prefix.strip().strip("/")

    def save_project(self, project_id: str, root: Path, *, workspace_id: str | None = None) -> None:
        payload = io.BytesIO()
        try:
            with zipfile.ZipFile(payload, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
                for path in sorted(root.rglob("*")):
                    if path.is_file():
                        archive.write(path, arcname=path.relative_to(root).as_posix())
            self._put(self._project_key(project_id, workspace_id), payload.getvalue(), "application/zip")
        except ArtifactStorageError:
            raise
        except Exception as exc:
            raise ArtifactStorageError("Could not persist generated project artifact.") from exc

    def restore_project(self, project_id: str, destination: Path, *, workspace_id: str | None = None) -> bool:
        # Try the workspace-namespaced key first, then fall back to the legacy
        # flat key -- artifacts written before namespacing existed (or by a
        # caller with no workspace context) are never orphaned.
        payload = self._get(self._project_key(project_id, workspace_id))
        if payload is None and workspace_id is not None:
            payload = self._get(self._project_key(project_id, None))
        if payload is None:
            return False

        destination.parent.mkdir(parents=True, exist_ok=True)
        staging = Path(tempfile.mkdtemp(prefix=f".restore-{project_id}-", dir=destination.parent))
        try:
            with zipfile.ZipFile(io.BytesIO(payload)) as archive:
                self._safe_extract(archive, staging)
            if not (staging / ".ldcn-generation.json").is_file():
                raise ArtifactStorageError("Stored project artifact has no generation marker.")
            if destination.exists():
                shutil.rmtree(staging, ignore_errors=True)
                return True
            staging.replace(destination)
            return True
        except ArtifactStorageError:
            shutil.rmtree(staging, ignore_errors=True)
            raise
        except Exception as exc:
            shutil.rmtree(staging, ignore_errors=True)
            raise ArtifactStorageError("Could not restore generated project artifact.") from exc

    def save_download(self, project_id: str, zip_path: Path, *, workspace_id: str | None = None) -> None:
        try:
            self._put(self._download_key(project_id, workspace_id), zip_path.read_bytes(), "application/zip")
        except ArtifactStorageError:
            raise
        except Exception as exc:
            raise ArtifactStorageError("Could not persist prepared project download.") from exc

    def restore_download(self, project_id: str, destination: Path, *, workspace_id: str | None = None) -> bool:
        payload = self._get(self._download_key(project_id, workspace_id))
        if payload is None and workspace_id is not None:
            payload = self._get(self._download_key(project_id, None))
        if payload is None:
            return False
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_name(f".{destination.name}.tmp")
        try:
            temporary.write_bytes(payload)
            temporary.replace(destination)
            return True
        except Exception as exc:
            temporary.unlink(missing_ok=True)
            raise ArtifactStorageError("Could not restore prepared project download.") from exc

    def _put(self, key: str, payload: bytes, content_type: str) -> None:
        try:
            self._client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=payload,
                ContentType=content_type,
                ServerSideEncryption="AES256",
            )
        except Exception as exc:
            raise ArtifactStorageError("Artifact storage is unavailable.") from exc

    def _get(self, key: str) -> bytes | None:
        try:
            response = self._client.get_object(Bucket=self.bucket, Key=key)
            body = response["Body"]
            return body.read() if hasattr(body, "read") else bytes(body)
        except Exception as exc:
            response = getattr(exc, "response", None)
            code = str((response or {}).get("Error", {}).get("Code", ""))
            if code in {"NoSuchKey", "404", "NotFound"}:
                return None
            raise ArtifactStorageError("Artifact storage is unavailable.") from exc

    def _project_key(self, project_id: str, workspace_id: str | None) -> str:
        category = f"workspaces/{workspace_id}/projects" if workspace_id else "projects"
        return self._key(category, f"{project_id}.zip")

    def _download_key(self, project_id: str, workspace_id: str | None) -> str:
        category = f"workspaces/{workspace_id}/downloads" if workspace_id else "downloads"
        return self._key(category, f"{project_id}.zip")

    def _key(self, category: str, name: str) -> str:
        suffix = f"{category}/{name}"
        return f"{self.prefix}/{suffix}" if self.prefix else suffix

    @staticmethod
    def _safe_extract(archive: zipfile.ZipFile, destination: Path) -> None:
        root = destination.resolve()
        for info in archive.infolist():
            candidate = Path(info.filename)
            if candidate.is_absolute() or ".." in candidate.parts or "\x00" in info.filename:
                raise ArtifactStorageError("Stored project artifact contains an unsafe path.")
            target = (root / candidate).resolve()
            if target != root and root not in target.parents:
                raise ArtifactStorageError("Stored project artifact escaped its restore directory.")
        archive.extractall(root)


_store: ArtifactStore | None = None
_store_signature: tuple[str, str, str, str, str] | None = None


def get_artifact_store(settings: Settings | None = None) -> ArtifactStore:
    global _store, _store_signature
    current = settings or get_settings()
    signature = (
        current.artifact_storage_backend,
        current.artifact_storage_bucket,
        current.artifact_storage_prefix,
        current.artifact_storage_endpoint,
        current.artifact_storage_region,
    )
    if _store is None or _store_signature != signature:
        if current.artifact_storage_backend == "s3":
            _store = S3ArtifactStore(
                bucket=current.artifact_storage_bucket,
                prefix=current.artifact_storage_prefix,
                endpoint_url=current.artifact_storage_endpoint,
                region_name=current.artifact_storage_region,
            )
        else:
            _store = LocalArtifactStore()
        _store_signature = signature
    return _store
