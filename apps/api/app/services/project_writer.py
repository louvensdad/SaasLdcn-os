from __future__ import annotations

import json
import re
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
    ) -> WriteResult:
        project_id = f"{_slugify(project_name)}_{uuid4().hex[:12]}"
        root = (self.output_root / project_id).resolve()
        # defense in depth: the project dir must stay under the output root
        if self.output_root != root and self.output_root not in root.parents:
            raise ProjectWriteError("Resolved project root escaped the output directory.")
        root.mkdir(parents=True, exist_ok=True)

        written: list[str] = []
        for emitted in files:
            target = self._safe_target(root, emitted.path)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(emitted.content, encoding="utf-8")
            written.append(target.relative_to(root).as_posix())

        self._write_marker(root, project_id, project_name, metadata, written)
        return WriteResult(project_id=project_id, root_path=str(root), written=written)

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

    def _write_marker(
        self,
        root: Path,
        project_id: str,
        project_name: str,
        metadata: dict | None,
        written: list[str],
    ) -> None:
        marker = {
            "contractVersion": CONTRACT_VERSION,
            "project_id": project_id,
            "project_name": project_name,
            "generated_by": "meta_factory",
            "generated_at": datetime.now(UTC).replace(microsecond=0).isoformat(),
            "file_count": len(written),
            "metadata": metadata or {},
        }
        (root / ".ldcn-generation.json").write_text(
            json.dumps(marker, ensure_ascii=False, indent=2), encoding="utf-8"
        )
