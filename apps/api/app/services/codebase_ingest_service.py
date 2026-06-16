from __future__ import annotations

import io
import re
import shutil
import subprocess
import zipfile
from pathlib import Path
from uuid import uuid4

from app.core.config import BASE_DIR

# Brownfield ingestion (PASSO 3): accept an existing codebase as a .zip upload or a
# git URL, extract it into a sandbox, and build a read-only inventory.
#
# Security posture (the legacy code is untrusted input):
# - Zip-Slip guard: every entry must resolve INSIDE the sandbox; absolute paths,
#   drive letters and ".." segments are rejected.
# - Resource limits: max files, max total uncompressed bytes, max single file.
# - Extension allowlist: only text/code files are extracted and read; binaries and
#   anything unknown are skipped (counted, never opened).
# - No execution: files are only read. git clone is shallow, depth 1, with a
#   timeout, and only over https/ssh remotes (no file:// / local paths).

WORKSPACE_ROOT = BASE_DIR.parents[1].resolve()
INGEST_ROOT = WORKSPACE_ROOT / "generated-projects" / "temp" / "ingest"

MAX_FILES = 5000
MAX_TOTAL_BYTES = 50 * 1024 * 1024  # 50 MB uncompressed
MAX_FILE_BYTES = 5 * 1024 * 1024  # 5 MB per file
GIT_CLONE_TIMEOUT_SECONDS = 60

_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]+$")

# Extension -> language. Only these are extracted/inventoried for analysis.
_LANG_BY_EXT: dict[str, str] = {
    ".py": "python", ".java": "java", ".kt": "kotlin", ".ts": "typescript",
    ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript", ".go": "go",
    ".rb": "ruby", ".php": "php", ".cs": "csharp", ".rs": "rust", ".c": "c",
    ".cpp": "cpp", ".h": "c", ".sql": "sql", ".sh": "shell", ".yaml": "yaml",
    ".yml": "yaml", ".json": "json", ".toml": "toml", ".xml": "xml", ".md": "markdown",
    ".html": "html", ".css": "css", ".env": "dotenv", ".gradle": "gradle",
}
_ALLOWED_NAMES = {"dockerfile", "makefile", ".gitignore", "pom.xml", "requirements.txt"}


class CodebaseIngestError(RuntimeError):
    """Raised when an upload/clone is unsafe or exceeds limits."""


class IngestResult:
    def __init__(self, ingest_id: str, source: str, root: Path, skipped: int):
        self.ingest_id = ingest_id
        self.source = source
        self.root = root
        self.skipped = skipped


def _language_for(path: Path) -> str | None:
    name = path.name.lower()
    if name in _ALLOWED_NAMES or "dockerfile" in name:
        return "dockerfile" if "dockerfile" in name else "config"
    return _LANG_BY_EXT.get(path.suffix.lower())


def _safe_member_path(dest: Path, name: str) -> Path | None:
    """Resolve a zip member name under `dest`, or None if it escapes the sandbox."""
    norm = name.replace("\\", "/")
    if not norm or norm.endswith("/"):
        return None  # directory entry
    if norm.startswith("/") or (len(norm) > 1 and norm[1] == ":"):
        return None  # absolute path / drive letter
    if ".." in Path(norm).parts:
        return None  # parent traversal
    target = (dest / norm).resolve()
    dest_resolved = dest.resolve()
    if target != dest_resolved and dest_resolved not in target.parents:
        return None
    return target


class CodebaseIngestService:
    def __init__(self, root: Path | None = None):
        self._root = Path(root).resolve() if root else INGEST_ROOT
        self._roots: dict[str, Path] = {}

    def root_for(self, ingest_id: str) -> Path:
        if ingest_id not in self._roots:
            raise CodebaseIngestError(f"Unknown ingest id '{ingest_id}'.")
        return self._roots[ingest_id]

    # --- ZIP ---------------------------------------------------------------- #

    def ingest_zip(self, data: bytes) -> IngestResult:
        ingest_id = f"ingest_{uuid4().hex[:12]}"
        dest = self._root / ingest_id
        dest.mkdir(parents=True, exist_ok=True)

        try:
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                if zf.testzip() is not None:  # corrupt member
                    raise CodebaseIngestError("Zip archive is corrupt.")
                infos = [i for i in zf.infolist() if not i.is_dir()]
                if len(infos) > MAX_FILES:
                    raise CodebaseIngestError(f"Archive has too many files (> {MAX_FILES}).")
                total = 0
                skipped = 0
                for info in infos:
                    if info.file_size > MAX_FILE_BYTES:
                        skipped += 1
                        continue
                    total += info.file_size
                    if total > MAX_TOTAL_BYTES:
                        raise CodebaseIngestError("Archive exceeds the uncompressed size limit.")
                    target = _safe_member_path(dest, info.filename)
                    if target is None:
                        # Zip-Slip / unsafe entry: refuse the whole archive.
                        raise CodebaseIngestError(f"Unsafe path in archive: {info.filename!r}")
                    if _language_for(target) is None:
                        skipped += 1
                        continue
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with zf.open(info) as src, open(target, "wb") as out:
                        out.write(src.read())
        except zipfile.BadZipFile as exc:
            shutil.rmtree(dest, ignore_errors=True)
            raise CodebaseIngestError("Uploaded file is not a valid zip archive.") from exc
        except CodebaseIngestError:
            shutil.rmtree(dest, ignore_errors=True)
            raise

        self._roots[ingest_id] = dest
        return IngestResult(ingest_id, "zip", dest, skipped)

    # --- GIT ---------------------------------------------------------------- #

    def ingest_git(self, git_url: str) -> IngestResult:
        url = git_url.strip()
        if not (url.startswith("https://") or url.startswith("git@")):
            raise CodebaseIngestError("Only https:// or git@ remotes are allowed.")
        if "file://" in url or url.startswith("/") or "\\" in url:
            raise CodebaseIngestError("Local/file remotes are not allowed.")

        ingest_id = f"ingest_{uuid4().hex[:12]}"
        dest = self._root / ingest_id
        dest.mkdir(parents=True, exist_ok=True)
        try:
            subprocess.run(
                ["git", "clone", "--depth", "1", "--", url, str(dest)],
                check=True,
                capture_output=True,
                timeout=GIT_CLONE_TIMEOUT_SECONDS,
            )
        except FileNotFoundError as exc:
            shutil.rmtree(dest, ignore_errors=True)
            raise CodebaseIngestError("git is not installed on the server.") from exc
        except subprocess.TimeoutExpired as exc:
            shutil.rmtree(dest, ignore_errors=True)
            raise CodebaseIngestError("git clone timed out.") from exc
        except subprocess.CalledProcessError as exc:
            shutil.rmtree(dest, ignore_errors=True)
            detail = (exc.stderr or b"").decode("utf-8", "ignore")[:200]
            raise CodebaseIngestError(f"git clone failed: {detail}") from exc

        shutil.rmtree(dest / ".git", ignore_errors=True)
        self._roots[ingest_id] = dest
        # Skipped count is computed lazily by the analysis walk; 0 here.
        return IngestResult(ingest_id, "git", dest, 0)

    # --- shared walk -------------------------------------------------------- #

    def iter_files(self, ingest_id: str):
        """Yield (relative_path, absolute_path, language) for inventoried files."""
        root = self.root_for(ingest_id)
        for path in sorted(root.rglob("*")):
            if not path.is_file() or ".git" in path.parts:
                continue
            language = _language_for(path)
            if language is None:
                continue
            try:
                size = path.stat().st_size
            except OSError:
                continue
            if size > MAX_FILE_BYTES:
                continue
            yield path.relative_to(root).as_posix(), path, language


codebase_ingest_service = CodebaseIngestService()
