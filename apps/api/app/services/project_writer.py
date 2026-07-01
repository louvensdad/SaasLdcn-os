from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from app.core.config import BASE_DIR
from app.data.foundation import CONTRACT_VERSION
from app.services.file_protocol import EmittedFile

# Writes parsed agent output (EmittedFile list) to disk under generated-projects,
# producing a directory that the existing GeneratedProjectService can browse,
# preview, and zip (it writes the required `.ldcn-generation.json` marker).

WORKSPACE_ROOT = BASE_DIR.parents[1].resolve()
DEFAULT_OUTPUT_ROOT = WORKSPACE_ROOT / "generated-projects" / "active"


class ProjectWriteError(RuntimeError):
    """Raised when a file cannot be written safely (traversal, absolute path)."""


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "meta-factory-project"


@dataclass
class WriteResult:
    project_id: str
    root_path: str
    written: list[str] = field(default_factory=list)

    @property
    def file_count(self) -> int:
        return len(self.written)


class ProjectWriter:
    def __init__(self, output_root: Path | None = None):
        self.output_root = Path(output_root).resolve() if output_root else DEFAULT_OUTPUT_ROOT

    def write(
        self,
        files: list[EmittedFile],
        *,
        project_name: str = "meta-factory-project",
        metadata: dict | None = None,
        owner: str | None = None,
    ) -> WriteResult:
        project_id = f"{_slugify(project_name)}_{uuid4().hex[:12]}"
        root = (self.output_root / project_id).resolve()
        # defense in depth: the project dir must stay under the output root
        if self.output_root != root and self.output_root not in root.parents:
            raise ProjectWriteError("Resolved project root escaped the output directory.")
        self.output_root.mkdir(parents=True, exist_ok=True)

        # Atomic write (audit MF2): assemble the whole project in a sibling staging
        # dir and publish it with a single atomic rename. A crash/exception mid-write
        # leaves only the staging dir (removed here), never a half-populated project
        # directory that download/export could read. Staging is under output_root so
        # the rename stays on one filesystem.
        staging = Path(tempfile.mkdtemp(prefix=f".staging-{project_id}-", dir=self.output_root))
        try:
            written: list[str] = []
            for emitted in files:
                target = self._safe_target(staging, emitted.path)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(emitted.content, encoding="utf-8")
                written.append(target.relative_to(staging).as_posix())

            all_files = self._merge_paths([], written)
            self._write_marker(staging, project_id, project_name, metadata, all_files, owner=owner)
            os.replace(staging, root)
        except BaseException:
            shutil.rmtree(staging, ignore_errors=True)
            raise
        return WriteResult(project_id=project_id, root_path=str(root), written=all_files)

    def append(
        self,
        project_id: str,
        files: list[EmittedFile],
        *,
        metadata: dict | None = None,
        owner: str | None = None,
    ) -> WriteResult:
        root = self._project_root(project_id)
        marker = self._read_marker(root)
        project_name = str(marker.get("project_name") or "meta-factory-project")

        written: list[str] = []
        for emitted in files:
            target = self._safe_target(root, emitted.path)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(emitted.content, encoding="utf-8")
            written.append(target.relative_to(root).as_posix())

        existing_files = marker.get("files")
        if not isinstance(existing_files, list):
            existing_files = self._existing_file_paths(root)
        all_files = self._merge_paths([str(path) for path in existing_files], written)
        merged_metadata = self._merge_metadata(marker.get("metadata"), metadata)
        # Preserve the original owner; the first writer establishes ownership.
        owner = owner or self._marker_owner(marker)
        self._write_marker(root, project_id, project_name, merged_metadata, all_files, owner=owner)
        return WriteResult(project_id=project_id, root_path=str(root), written=all_files)

    def set_verification(self, project_id: str, *, verified: bool, score: int) -> None:
        """Persist the release-gate verdict into the project marker so download/export
        can read it cheaply without re-running the (slow) build validation."""
        root = self._project_root(project_id)
        marker = self._read_marker(root)
        project_name = str(marker.get("project_name") or "meta-factory-project")
        metadata = self._merge_metadata(
            marker.get("metadata"), {"verified": bool(verified), "verification_score": int(score)}
        )
        files = marker.get("files")
        if not isinstance(files, list):
            files = self._existing_file_paths(root)
        self._write_marker(
            root, project_id, project_name, metadata, [str(p) for p in files], owner=self._marker_owner(marker)
        )

    def read_verification(self, project_id: str) -> dict:
        """Return the persisted verification verdict (defaults to unverified)."""
        root = self._project_root(project_id)
        meta = self._read_marker(root).get("metadata")
        meta = meta if isinstance(meta, dict) else {}
        return {
            "verified": bool(meta.get("verified")),
            "verification_score": int(meta.get("verification_score") or 0),
        }

    def delete(self, project_id: str, relative_path: str) -> bool:
        """Safely delete a single file inside the generated project.

        Used by the Auto-Repair engine to remove a real .env / secret file. Reuses
        the same path-traversal protection as writes, and refuses to delete the
        generation marker itself."""
        root = self._project_root(project_id)
        target = self._safe_target(root, relative_path)
        if target.name == ".ldcn-generation.json":
            raise ProjectWriteError("Refusing to delete the generation marker.")
        if not target.is_file():
            return False
        target.unlink()
        marker = self._read_marker(root)
        project_name = str(marker.get("project_name") or "meta-factory-project")
        files = [p for p in self._existing_file_paths(root)]
        self._write_marker(
            root, project_id, project_name, marker.get("metadata"), files, owner=self._marker_owner(marker)
        )
        return True

    def set_release_override(self, project_id: str, *, by_user: str, reason: str) -> None:
        """Record a conscious 'liberar mesmo assim' override on the project marker."""
        root = self._project_root(project_id)
        marker = self._read_marker(root)
        project_name = str(marker.get("project_name") or "meta-factory-project")
        metadata = self._merge_metadata(
            marker.get("metadata"),
            {
                "release_override": {
                    "active": True,
                    "by": by_user,
                    "reason": reason,
                    "at": datetime.now(UTC).replace(microsecond=0).isoformat(),
                }
            },
        )
        files = marker.get("files")
        if not isinstance(files, list):
            files = self._existing_file_paths(root)
        self._write_marker(
            root, project_id, project_name, metadata, [str(p) for p in files], owner=self._marker_owner(marker)
        )

    def read_owner(self, project_id: str) -> str | None:
        """Return the recorded owner user id for a generated project, or None.

        Tolerant of a missing/invalid project (returns None) so callers can treat a
        non-existent project as 'unowned' and let the downstream service produce the
        proper 404. Projects written before ownership existed have no owner and are
        therefore not access-restricted by id (only API-generated projects record an
        owner)."""
        try:
            root = self._project_root(project_id)
            return self._marker_owner(self._read_marker(root))
        except ProjectWriteError:
            return None

    @staticmethod
    def _marker_owner(marker: dict) -> str | None:
        owner = marker.get("owner_user_id")
        return owner if isinstance(owner, str) and owner else None

    def _project_root(self, project_id: str) -> Path:
        if not project_id or "\x00" in project_id:
            raise ProjectWriteError("Project id is required.")
        candidate = Path(project_id)
        if candidate.is_absolute() or any(part == ".." for part in candidate.parts) or len(candidate.parts) != 1:
            raise ProjectWriteError(f"Invalid project id: {project_id}")
        root = (self.output_root / candidate).resolve()
        if self.output_root != root and self.output_root not in root.parents:
            raise ProjectWriteError("Resolved project root escaped the output directory.")
        if not root.is_dir():
            raise ProjectWriteError(f"Generated project does not exist: {project_id}")
        if not (root / ".ldcn-generation.json").is_file():
            raise ProjectWriteError("Generated project metadata was not found.")
        return root

    def _safe_target(self, root: Path, relative_path: str) -> Path:
        if not relative_path or "\x00" in relative_path:
            raise ProjectWriteError("Empty or null file path.")
        candidate = Path(relative_path)
        if candidate.is_absolute() or any(part == ".." for part in candidate.parts):
            raise ProjectWriteError(f"Path traversal is not allowed: {relative_path}")
        target = (root / candidate).resolve()
        if root not in target.parents and target != root:
            raise ProjectWriteError(f"Path escapes the project root: {relative_path}")
        return target

    def _read_marker(self, root: Path) -> dict:
        try:
            data = json.loads((root / ".ldcn-generation.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ProjectWriteError("Generated project metadata is invalid.") from exc
        return data if isinstance(data, dict) else {}

    def _existing_file_paths(self, root: Path) -> list[str]:
        return sorted(
            path.relative_to(root).as_posix()
            for path in root.rglob("*")
            if path.is_file() and path.name != ".ldcn-generation.json"
        )

    def _merge_paths(self, existing: list[str], new: list[str]) -> list[str]:
        merged: dict[str, None] = {}
        for path in existing + new:
            if path and path != ".ldcn-generation.json":
                merged[path] = None
        return sorted(merged)

    def _merge_metadata(self, existing: object, new: dict | None) -> dict:
        base = dict(existing) if isinstance(existing, dict) else {}
        if not new:
            return base
        for key, value in new.items():
            current = base.get(key)
            if isinstance(current, list) and isinstance(value, list):
                merged = list(dict.fromkeys([*current, *value]))
                base[key] = merged
            elif isinstance(current, dict) and isinstance(value, dict):
                nested = dict(current)
                nested.update(value)
                base[key] = nested
            else:
                base[key] = value
        return base

    def _write_marker(
        self,
        root: Path,
        project_id: str,
        project_name: str,
        metadata: dict | None,
        written: list[str],
        *,
        owner: str | None = None,
    ) -> None:
        marker = {
            "contractVersion": CONTRACT_VERSION,
            "project_id": project_id,
            "project_name": project_name,
            "owner_user_id": owner,
            "generated_by": "meta_factory",
            "generated_at": datetime.now(UTC).replace(microsecond=0).isoformat(),
            "file_count": len(written),
            "files": sorted(written),
            "metadata": metadata or {},
        }
        (root / ".ldcn-generation.json").write_text(
            json.dumps(marker, ensure_ascii=False, indent=2), encoding="utf-8"
        )
