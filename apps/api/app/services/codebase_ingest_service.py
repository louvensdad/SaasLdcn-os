from __future__ import annotations

import io
import re
import shutil
import subprocess
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from uuid import uuid4

from app.core.config import BASE_DIR, get_settings

# Brownfield ingestion (Enterprise): accept an existing codebase as a .zip upload or
# a git URL, extract ONLY the relevant code into a sandbox, and build a read-only
# inventory plus a professional pre-analysis report.
#
# Design (supports monorepos / microservices / hundreds of thousands of files):
# - Streaming: the archive is read member-by-member from disk; files are copied in
#   chunks. Nothing is fully buffered in memory and irrelevant trees are never read.
# - Smart Ignore Engine: build output / vendored deps / VCS metadata / IDE & OS
#   cruft are dropped BEFORE anything is read, so they never reach the AI.
# - Resource-based limits ONLY (never a fixed file count): an effective
#   analyzable-code-size cap, a per-file cap, a compressed-upload cap, and a
#   decompression-bomb ratio guard. A 145k-file repo whose code is mostly
#   node_modules/.git/build analyzes fine because those are ignored first.
#
# Security posture (the legacy code is untrusted input):
# - Zip-Slip guard: every entry must resolve INSIDE the sandbox.
# - No execution: files are only read. git clone is shallow, depth 1, timeout,
#   https/ssh remotes only.

WORKSPACE_ROOT = BASE_DIR.parents[1].resolve()
INGEST_ROOT = WORKSPACE_ROOT / "generated-projects" / "temp" / "ingest"

GIT_CLONE_TIMEOUT_SECONDS = 60
_COPY_CHUNK = 1 << 16  # 64 KiB streaming chunk

_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]+$")

# Extension -> language. Only these are extracted/inventoried for analysis.
_LANG_BY_EXT: dict[str, str] = {
    ".py": "python", ".java": "java", ".kt": "kotlin", ".kts": "kotlin",
    ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript",
    ".mjs": "javascript", ".cjs": "javascript", ".vue": "vue", ".go": "go",
    ".rb": "ruby", ".php": "php", ".cs": "csharp", ".rs": "rust", ".c": "c",
    ".cpp": "cpp", ".cc": "cpp", ".h": "c", ".hpp": "cpp", ".scala": "scala",
    ".swift": "swift", ".sql": "sql", ".sh": "shell", ".yaml": "yaml", ".yml": "yaml",
    ".json": "json", ".toml": "toml", ".xml": "xml", ".md": "markdown",
    ".html": "html", ".css": "css", ".scss": "css", ".env": "dotenv",
    ".gradle": "gradle", ".tf": "terraform", ".tfvars": "terraform",
    ".graphql": "graphql", ".gql": "graphql", ".proto": "protobuf",
}
_ALLOWED_NAMES = {
    "dockerfile", "makefile", ".gitignore", "pom.xml", "requirements.txt",
    "go.mod", "go.sum", "gemfile", "build.gradle", "settings.gradle",
    "cargo.toml", "composer.json", "package.json", "docker-compose.yml",
    "docker-compose.yaml",
}

# --- Smart Ignore Engine ---------------------------------------------------- #
# Directories that are build output / vendored deps / VCS metadata / caches / IDE
# settings. Any path containing one of these segments is dropped before analysis.
SMART_IGNORE_DIRS = {
    "node_modules", ".git", "dist", "build", "target", "out", "bin", "obj",
    "vendor", "coverage", ".cache", ".next", ".nuxt", ".gradle", ".idea",
    ".vscode", "__pycache__", "venv", ".venv", "logs", "temp", "tmp",
    "generated", ".terraform", ".mvn", ".pytest_cache", ".tox", ".svn", ".hg",
}
# OS / editor cruft files (matched on the filename, anywhere in the tree).
SMART_IGNORE_FILES = {".ds_store", "thumbs.db"}


def is_ignored(parts) -> bool:
    """True when a path is auto-ignored by the Smart Ignore Engine: any directory
    segment is a known junk dir, or the filename itself is OS/editor cruft."""
    segments = [str(p) for p in parts]
    if not segments:
        return False
    if any(segment.lower() in SMART_IGNORE_DIRS for segment in segments[:-1]):
        return True
    return segments[-1].lower() in SMART_IGNORE_FILES


# Back-compat alias (older imports used the private name).
_is_ignored = is_ignored


class CodebaseIngestError(RuntimeError):
    """Raised when an upload/clone is unsafe or exceeds resource limits."""


@dataclass
class IngestStats:
    files_found: int = 0
    ignored_count: int = 0
    analyzable_count: int = 0
    total_bytes: int = 0
    lines_of_code: int = 0
    languages: dict[str, int] = field(default_factory=dict)
    frameworks: list[str] = field(default_factory=list)
    complexity: str = "unknown"
    truncated: bool = False

    def as_dict(self) -> dict:
        return {
            "files_found": self.files_found,
            "ignored_count": self.ignored_count,
            "analyzable_count": self.analyzable_count,
            "total_bytes": self.total_bytes,
            "lines_of_code": self.lines_of_code,
            "languages": dict(self.languages),
            "frameworks": list(self.frameworks),
            "complexity": self.complexity,
            "truncated": self.truncated,
        }


class IngestResult:
    def __init__(self, ingest_id: str, source: str, root: Path, skipped: int, stats: IngestStats | None = None):
        self.ingest_id = ingest_id
        self.source = source
        self.root = root
        self.skipped = skipped
        self.stats = stats or IngestStats()


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


def _complexity_band(lines: int) -> str:
    if lines <= 0:
        return "unknown"
    if lines < 10_000:
        return "Baixa"
    if lines < 100_000:
        return "Média"
    if lines < 1_000_000:
        return "Alta"
    return "Muito alta (Enterprise)"


class CodebaseIngestService:
    def __init__(self, root: Path | None = None):
        self._root = Path(root).resolve() if root else INGEST_ROOT
        self._roots: dict[str, Path] = {}

    # --- limits (read live from settings so env overrides apply) ------------- #

    def _limits(self) -> tuple[int, int, int]:
        s = get_settings()
        return (
            int(s.modernize_max_analyzable_bytes),
            int(s.modernize_max_file_bytes),
            int(s.modernize_zip_bomb_ratio),
        )

    def root_for(self, ingest_id: str) -> Path:
        if ingest_id in self._roots:
            return self._roots[ingest_id]
        # Survive a process restart: the sandbox is already persisted on disk under
        # the ingest root, so reconstruct the mapping from a safe id that exists.
        if _SAFE_ID.match(ingest_id):
            candidate = (self._root / ingest_id).resolve()
            if candidate.is_dir() and self._root.resolve() in candidate.parents:
                self._roots[ingest_id] = candidate
                return candidate
        raise CodebaseIngestError(f"Unknown ingest id '{ingest_id}'.")

    def remove(self, ingest_id: str) -> None:
        """Delete the ingest sandbox from disk. Registered re-analysis roots point at
        generated projects outside the ingest root and are only unregistered."""
        try:
            root = self.root_for(ingest_id)
        except CodebaseIngestError:
            return
        self._roots.pop(ingest_id, None)
        if self._root.resolve() not in root.resolve().parents:
            return
        from app.services.fs_publish import force_rmtree

        force_rmtree(root)

    def register_root(self, root: Path) -> str:
        """Register an already-materialized directory so it can be inventoried/analyzed
        with the same read-only walk (used to re-analyze the project after auto-refactor)."""
        root = Path(root).resolve()
        if not root.is_dir():
            raise CodebaseIngestError("Cannot register a root that is not a directory.")
        ingest_id = f"reanalyze_{uuid4().hex[:12]}"
        self._roots[ingest_id] = root
        return ingest_id

    # --- ZIP ---------------------------------------------------------------- #

    def ingest_zip(self, data: bytes) -> IngestResult:
        """Convenience entry for in-memory archives (tests). Large uploads should be
        spooled to disk and passed via :meth:`ingest_zip_path` to avoid buffering."""
        return self._ingest_zip(io.BytesIO(data))

    def ingest_zip_path(self, path: Path) -> IngestResult:
        """Stream-ingest a .zip already spooled to disk (the route's large-upload path)."""
        with open(path, "rb") as handle:
            return self._ingest_zip(handle)

    def _ingest_zip(self, fileobj) -> IngestResult:
        ingest_id = f"ingest_{uuid4().hex[:12]}"
        dest = self._root / ingest_id
        dest.mkdir(parents=True, exist_ok=True)
        max_analyzable, max_file, bomb_ratio = self._limits()

        try:
            # No testzip(): it would decompress every member (incl. ignored trees),
            # defeating streaming on huge archives. Corrupt members raise on read.
            with zipfile.ZipFile(fileobj) as zf:
                stats = self._extract_relevant(zf, dest, max_analyzable, max_file, bomb_ratio)
        except zipfile.BadZipFile as exc:
            shutil.rmtree(dest, ignore_errors=True)
            raise CodebaseIngestError("Uploaded file is not a valid zip archive.") from exc
        except CodebaseIngestError:
            shutil.rmtree(dest, ignore_errors=True)
            raise

        stats.frameworks = self._detect_frameworks(dest)
        stats.complexity = _complexity_band(stats.lines_of_code)
        self._roots[ingest_id] = dest
        return IngestResult(ingest_id, "zip", dest, stats.ignored_count, stats)

    def _extract_relevant(
        self,
        zf: zipfile.ZipFile,
        dest: Path,
        max_analyzable: int,
        max_file: int,
        bomb_ratio: int,
    ) -> IngestStats:
        stats = IngestStats()
        total_uncompressed = 0
        total_compressed = 0

        for info in zf.infolist():
            if info.is_dir():
                continue
            target = _safe_member_path(dest, info.filename)
            if target is None:
                # Zip-Slip / unsafe entry: refuse the whole archive.
                raise CodebaseIngestError(f"Unsafe path in archive: {info.filename!r}")

            stats.files_found += 1
            total_uncompressed += info.file_size
            total_compressed += info.compress_size
            # Decompression-bomb guard: only meaningful once we've seen real volume.
            if total_uncompressed > 100 * 1024 * 1024 and total_compressed > 0:
                if total_uncompressed / total_compressed > bomb_ratio:
                    raise CodebaseIngestError("Archive looks like a decompression bomb (ratio too high).")

            parts = Path(info.filename.replace("\\", "/")).parts
            if is_ignored(parts):
                stats.ignored_count += 1
                continue
            language = _language_for(target)
            if language is None:
                stats.ignored_count += 1
                continue
            if info.file_size > max_file:
                stats.ignored_count += 1
                continue
            if stats.total_bytes + info.file_size > max_analyzable:
                # Resource cap reached: stop EXTRACTING more code, but keep counting
                # so the report is honest. The project still analyzes (it is not an error).
                stats.truncated = True
                stats.ignored_count += 1
                continue

            target.parent.mkdir(parents=True, exist_ok=True)
            try:
                lines = self._copy_member(zf, info, target)
            except (zipfile.BadZipFile, OSError) as exc:
                raise CodebaseIngestError(f"Failed to read archive member {info.filename!r}: {exc}") from exc
            stats.analyzable_count += 1
            stats.total_bytes += info.file_size
            stats.lines_of_code += lines
            stats.languages[language] = stats.languages.get(language, 0) + 1

        return stats

    def _copy_member(self, zf: zipfile.ZipFile, info: zipfile.ZipInfo, target: Path) -> int:
        """Stream one member to disk in chunks, counting lines without buffering it."""
        lines = 0
        saw_bytes = False
        ends_with_newline = True
        with zf.open(info) as src, open(target, "wb") as out:
            while True:
                chunk = src.read(_COPY_CHUNK)
                if not chunk:
                    break
                saw_bytes = True
                out.write(chunk)
                lines += chunk.count(b"\n")
                ends_with_newline = chunk.endswith(b"\n")
        # Count a final unterminated line.
        if saw_bytes and not ends_with_newline:
            lines += 1
        return lines

    # --- framework detection (cheap; reads only a few marker files) --------- #

    def _detect_frameworks(self, root: Path) -> list[str]:
        found: list[str] = []

        def add(label: str) -> None:
            if label not in found:
                found.append(label)

        # Map a marker filename to the first path that bears it, anywhere in the
        # tree (markers commonly live in backend/ or frontend/, not at the root).
        by_name: dict[str, Path] = {}
        exts: set[str] = set()
        for path in root.rglob("*"):
            if path.is_file():
                by_name.setdefault(path.name.lower(), path)
                exts.add(path.suffix.lower())
        names = set(by_name)

        def read(name: str) -> str:
            target = by_name.get(name.lower())
            if target is None:
                return ""
            try:
                return target.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                return ""

        # JVM
        if "pom.xml" in names or "build.gradle" in names or "build.gradle.kts" in names:
            blob = read("pom.xml") + read("build.gradle") + read("build.gradle.kts")
            if "spring-boot" in blob or "springframework" in blob:
                add("Spring Boot")
            elif "pom.xml" in names:
                add("Java/Maven")
            else:
                add("Java/Gradle")
        # Node / JS frameworks
        if "package.json" in names:
            pkg = read("package.json")
            if '"next"' in pkg:
                add("Next.js")
            if '"react"' in pkg:
                add("React")
            if '"@angular/core"' in pkg:
                add("Angular")
            if '"vue"' in pkg:
                add("Vue")
            if '"express"' in pkg:
                add("Express")
            if '"@nestjs/core"' in pkg:
                add("NestJS")
        # Python frameworks
        py = read("requirements.txt") + read("pyproject.toml")
        if "django" in py.lower():
            add("Django")
        if "fastapi" in py.lower():
            add("FastAPI")
        if "flask" in py.lower():
            add("Flask")
        # Infra
        if any("dockerfile" in n for n in names):
            add("Docker")
        if "docker-compose.yml" in names or "docker-compose.yaml" in names or "compose.yaml" in names:
            add("Docker Compose")
        if ".tf" in exts:
            add("Terraform")
        if self._has_kubernetes(root):
            add("Kubernetes")
        # Databases (heuristic on marker files / configs)
        infra_blob = (py + read("package.json") + read("pom.xml")).lower()
        if "postgres" in infra_blob or "psycopg" in infra_blob:
            add("PostgreSQL")
        if "mysql" in infra_blob or "mariadb" in infra_blob:
            add("MySQL")
        if "mongodb" in infra_blob or "mongoose" in infra_blob:
            add("MongoDB")
        return found

    def _has_kubernetes(self, root: Path) -> bool:
        checked = 0
        for path in root.rglob("*"):
            if path.suffix.lower() not in {".yaml", ".yml"} or not path.is_file():
                continue
            checked += 1
            if checked > 200:
                break
            try:
                head = path.read_text(encoding="utf-8", errors="ignore")[:2000]
            except OSError:
                continue
            if "apiVersion:" in head and "kind:" in head:
                return True
        return False

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
        stats = self._stats_for_dir(dest)
        stats.frameworks = self._detect_frameworks(dest)
        stats.complexity = _complexity_band(stats.lines_of_code)
        return IngestResult(ingest_id, "git", dest, stats.ignored_count, stats)

    def _stats_for_dir(self, root: Path) -> IngestStats:
        """Build the pre-analysis report for an already-materialized directory by
        applying the same Smart Ignore Engine + relevance + resource rules."""
        _max_analyzable, max_file, _ratio = self._limits()
        stats = IngestStats()
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            rel_parts = path.relative_to(root).parts
            stats.files_found += 1
            try:
                size = path.stat().st_size
            except OSError:
                stats.ignored_count += 1
                continue
            if is_ignored(rel_parts):
                stats.ignored_count += 1
                continue
            language = _language_for(path)
            if language is None or size > max_file:
                stats.ignored_count += 1
                continue
            stats.analyzable_count += 1
            stats.total_bytes += size
            stats.lines_of_code += self._count_lines(path)
            stats.languages[language] = stats.languages.get(language, 0) + 1
        return stats

    def _count_lines(self, path: Path) -> int:
        lines = 0
        saw = False
        ends_nl = True
        try:
            with open(path, "rb") as handle:
                while True:
                    chunk = handle.read(_COPY_CHUNK)
                    if not chunk:
                        break
                    saw = True
                    lines += chunk.count(b"\n")
                    ends_nl = chunk.endswith(b"\n")
        except OSError:
            return 0
        return lines + (1 if saw and not ends_nl else 0)

    # --- shared walk -------------------------------------------------------- #

    def iter_files(self, ingest_id: str):
        """Yield (relative_path, absolute_path, language) for inventoried files."""
        root = self.root_for(ingest_id)
        _max_analyzable, max_file, _ratio = self._limits()
        for path in sorted(root.rglob("*")):
            if not path.is_file() or is_ignored(path.relative_to(root).parts):
                continue
            language = _language_for(path)
            if language is None:
                continue
            try:
                size = path.stat().st_size
            except OSError:
                continue
            if size > max_file:
                continue
            yield path.relative_to(root).as_posix(), path, language


codebase_ingest_service = CodebaseIngestService()
