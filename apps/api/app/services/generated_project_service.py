from __future__ import annotations

import hashlib
import re
import zipfile
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status

from app.core.config import BASE_DIR
from app.data.foundation import CONTRACT_VERSION

MAX_PREVIEW_BYTES = 64 * 1024
DOWNLOAD_DIR = BASE_DIR / "app" / "data" / "prepared-downloads"
TEXT_EXTENSIONS = {
    ".css",
    ".html",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".mjs",
    ".tsx",
    ".ts",
    ".txt",
    ".yml",
    ".yaml",
}
SECRET_NAME_PATTERN = re.compile(
    r"(^\.env($|\.)|secret|token|password|api[_-]?key|private[_-]?key|credential|id_rsa|\.pem$|\.p12$)",
    re.IGNORECASE,
)
SECRET_VALUE_PATTERN = re.compile(
    r"(secret|token|password|api[_-]?key|private[_-]?key|credential)\s*[:=]\s*['\"]?([A-Za-z0-9_\-./+=]{12,})",
    re.IGNORECASE,
)


class GeneratedProjectService:
    def __init__(self) -> None:
        self.workspace_root = BASE_DIR.parents[1].resolve()

    def list_files(self, project: dict[str, Any]) -> dict[str, Any]:
        root = self._project_root(project)
        entries, blocked = self._safe_entries(root)
        files = [entry for entry in entries if entry["kind"] == "file"]
        directories = [entry for entry in entries if entry["kind"] == "directory"]
        return {
            "contractVersion": CONTRACT_VERSION,
            "project_id": project["project_id"],
            "root_path": str(root),
            "files": files,
            "directories": directories,
            "file_count": len(files),
            "total_size_bytes": sum(item["size_bytes"] for item in files),
            "security": self._security(blocked),
        }

    def read_file(self, project: dict[str, Any], relative_path: str) -> dict[str, Any]:
        root = self._project_root(project)
        target = self._resolve_inside(root, relative_path)
        if not target.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generated file was not found.")
        if self._is_secret_candidate(root, target):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Secret-like generated files cannot be previewed.")

        size_bytes = target.stat().st_size
        if size_bytes > MAX_PREVIEW_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Generated file preview is limited to {MAX_PREVIEW_BYTES} bytes.",
            )

        data = target.read_bytes()
        if self._is_binary(data):
            return {
                "contractVersion": CONTRACT_VERSION,
                "project_id": project["project_id"],
                "relative_path": target.relative_to(root).as_posix(),
                "size_bytes": size_bytes,
                "preview_supported": False,
                "content_type": "binary",
                "content": None,
                "unsupported_reason": "Binary file preview is unsupported.",
            }

        text = data.decode("utf-8")
        if self._contains_secret_value(text):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Secret-like generated content cannot be previewed.")
        return {
            "contractVersion": CONTRACT_VERSION,
            "project_id": project["project_id"],
            "relative_path": target.relative_to(root).as_posix(),
            "size_bytes": size_bytes,
            "preview_supported": True,
            "content_type": "text",
            "content": text,
            "unsupported_reason": None,
        }

    def prepare_download(self, project: dict[str, Any]) -> dict[str, Any]:
        root = self._project_root(project)
        entries, blocked = self._safe_entries(root)
        files = [entry for entry in entries if entry["kind"] == "file"]
        if not files:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Generated project has no safe files to download.")

        DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
        zip_path = self._zip_path(project["project_id"])
        with zipfile.ZipFile(zip_path, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
            for entry in files:
                relative_path = entry["relative_path"]
                source = self._resolve_inside(root, relative_path)
                archive.write(source, arcname=relative_path)

        return {
            "contractVersion": CONTRACT_VERSION,
            "project_id": project["project_id"],
            "status": "prepared",
            "download_url": f"/api/generation/{project['project_id']}/download",
            "zip_size_bytes": zip_path.stat().st_size,
            "file_count": len(files),
            "source_size_bytes": sum(item["size_bytes"] for item in files),
            "security": self._security(blocked),
        }

    def export_files(self, project: dict[str, Any]) -> list[dict[str, Any]]:
        root = self._project_root(project)
        entries, _ = self._safe_entries(root)
        return [
            {
                "relative_path": entry["relative_path"],
                "content": self._resolve_inside(root, entry["relative_path"]).read_bytes(),
            }
            for entry in entries
            if entry["kind"] == "file"
        ]

    def download_path(self, project: dict[str, Any]) -> Path:
        self._project_root(project)
        zip_path = self._zip_path(project["project_id"])
        if not zip_path.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prepare download before requesting the ZIP file.")
        return zip_path

    def _project_root(self, project: dict[str, Any]) -> Path:
        raw_path = project.get("generated_project_path")
        if not raw_path:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Project has no generated project path. Run local generation first.")
        root = Path(str(raw_path)).resolve()
        if not root.exists():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Generated project path does not exist: {root}")
        if not root.is_dir():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Generated project path is not a directory.")
        if root == self.workspace_root or self.workspace_root not in root.parents:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Generated project path must stay inside the LDCN OS workspace.")
        if not (root / ".ldcn-generation.json").is_file():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Generated project metadata was not found.")
        return root

    def _safe_entries(self, root: Path) -> tuple[list[dict[str, Any]], list[str]]:
        entries: list[dict[str, Any]] = []
        blocked: list[str] = []
        for item in sorted(root.rglob("*")):
            relative_path = item.relative_to(root).as_posix()
            if self._is_secret_candidate(root, item):
                blocked.append(relative_path)
                continue
            if item.is_dir():
                entries.append(
                    {
                        "relative_path": relative_path,
                        "kind": "directory",
                        "size_bytes": 0,
                        "checksum": None,
                        "extension": None,
                        "preview_supported": False,
                    }
                )
            elif item.is_file():
                data = item.read_bytes()
                if not self._is_binary(data):
                    try:
                        if self._contains_secret_value(data.decode("utf-8")):
                            blocked.append(relative_path)
                            continue
                    except UnicodeDecodeError:
                        pass
                entries.append(
                    {
                        "relative_path": relative_path,
                        "kind": "file",
                        "size_bytes": item.stat().st_size,
                        "checksum": self._checksum(item),
                        "extension": item.suffix.lower() or None,
                        "preview_supported": item.suffix.lower() in TEXT_EXTENSIONS and not self._is_binary(data),
                    }
                )
        return entries, blocked

    def _resolve_inside(self, root: Path, relative_path: str) -> Path:
        if not relative_path or "\x00" in relative_path:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Generated file path is required.")
        candidate = Path(relative_path)
        if candidate.is_absolute() or any(part == ".." for part in candidate.parts):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Path traversal is not allowed.")
        target = (root / candidate).resolve()
        if root not in target.parents and target != root:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Path traversal is not allowed.")
        return target

    def _zip_path(self, project_id: str) -> Path:
        safe_project_id = re.sub(r"[^a-zA-Z0-9_.-]", "_", project_id)
        return DOWNLOAD_DIR / f"{safe_project_id}.zip"

    def _is_secret_candidate(self, root: Path, path: Path) -> bool:
        relative_path = path.relative_to(root).as_posix()
        if relative_path == ".env.example":
            return False
        return bool(SECRET_NAME_PATTERN.search(relative_path))

    def _contains_secret_value(self, content: str) -> bool:
        return bool(SECRET_VALUE_PATTERN.search(content))

    def _is_binary(self, data: bytes) -> bool:
        if b"\x00" in data:
            return True
        try:
            data.decode("utf-8")
        except UnicodeDecodeError:
            return True
        return False

    def _checksum(self, path: Path) -> str:
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def _security(self, blocked: list[str]) -> dict[str, Any]:
        return {
            "status": "filtered" if blocked else "safe",
            "message": "Secret-like files were excluded." if blocked else "Generated project files passed local safety filters.",
            "blocked_files": blocked,
            "blocked_count": len(blocked),
        }
