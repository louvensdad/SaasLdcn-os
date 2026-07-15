from __future__ import annotations

import io
import shutil
import zipfile
from pathlib import Path
from uuid import uuid4

import pytest

from app.core.config import get_settings
from app.services.codebase_ingest_service import (
    INGEST_ROOT,
    SMART_IGNORE_DIRS,
    CodebaseIngestError,
    CodebaseIngestService,
    _language_for,
    is_ignored,
)


@pytest.fixture
def service():
    # Workspace-local temp root: pytest's tmp_path base is permission-restricted on
    # this Windows host (see premium-foundation-test-state memo), so we manage our own.
    root = INGEST_ROOT.parent / f"itest-{uuid4().hex[:12]}"
    svc = CodebaseIngestService(root=root)
    try:
        yield svc
    finally:
        shutil.rmtree(root, ignore_errors=True)

# Directories the Modernize spec mandates the Smart Ignore Engine must drop.
_SPEC_IGNORED = [
    "node_modules", ".git", "dist", "build", "target", "out", "bin", "obj",
    "vendor", "coverage", ".cache", ".next", ".nuxt", ".gradle", ".idea",
    ".vscode", "__pycache__", "venv", ".venv", "logs", "temp", "tmp", "generated",
]


def test_smart_ignore_covers_every_spec_directory():
    for name in _SPEC_IGNORED:
        assert name in SMART_IGNORE_DIRS, name
        assert is_ignored((name, "deep", "file.js")) is True
        assert is_ignored(("src", name, "x.ts")) is True
    # OS / editor cruft files are ignored by name anywhere.
    assert is_ignored(("a", "b", ".DS_Store")) is True
    assert is_ignored(("Thumbs.db",)) is True
    # A normal source path is NOT ignored.
    assert is_ignored(("src", "main", "App.tsx")) is False


def test_relevant_language_index_covers_enterprise_stack():
    cases = {
        "Service.java": "java", "Main.kt": "kotlin", "app.py": "python",
        "server.go": "go", "lib.rs": "rust", "Component.tsx": "typescript",
        "index.js": "javascript", "App.vue": "vue", "Program.cs": "csharp",
        "index.php": "php", "model.rb": "ruby", "main.tf": "terraform",
        "schema.sql": "sql", "values.yaml": "yaml", "openapi.json": "json",
        "schema.graphql": "graphql", "README.md": "markdown",
    }
    for filename, language in cases.items():
        assert _language_for(Path(filename)) == language, filename
    # Marker files are indexed as config; Dockerfile as dockerfile.
    assert _language_for(Path("Dockerfile")) == "dockerfile"
    assert _language_for(Path("pom.xml")) == "config"
    # A vendored binary blob is not relevant.
    assert _language_for(Path("app.min.js.map.bin")) is None


def _enterprise_zip(real_files: dict[str, str]) -> bytes:
    """A realistic Enterprise archive: >100k files, almost all of which are
    node_modules / .git / build output that must never reach the AI."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_STORED) as zf:
        for i in range(100_000):
            zf.writestr(f"frontend/node_modules/pkg{i % 500}/file{i}.js", "module.exports = {}\n")
        for i in range(3_000):
            zf.writestr(f".git/objects/{i:04d}/obj{i}", "blob")
        for i in range(3_000):
            zf.writestr(f"backend/target/classes/Gen{i}.class", "BINARYish")
        for path, content in real_files.items():
            zf.writestr(path, content)
    return buffer.getvalue()


def _small_junk_zip(real_files: dict[str, str], junk: int = 200) -> bytes:
    """Same shape as the Enterprise archive but tiny: `junk` ignorable files spread
    across node_modules / .git / build, plus a small real app. Fast-suite friendly."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_STORED) as zf:
        per = junk // 3
        for i in range(per):
            zf.writestr(f"web/node_modules/dep{i}/index.js", "module.exports = {}\n")
        for i in range(per):
            zf.writestr(f".git/objects/{i:03d}/obj", "blob")
        for i in range(junk - 2 * per):
            zf.writestr(f"build/out/Gen{i}.class", "BINARYish")
        for path, content in real_files.items():
            zf.writestr(path, content)
    return buffer.getvalue()


_REAL_APP = {
    "backend/pom.xml": "<project><dependency>spring-boot-starter-web</dependency></project>",
    "backend/src/main/java/com/app/UserController.java": "class UserController { void list() {} }\n",
    "frontend/package.json": '{"dependencies": {"react": "^18.2.0"}}',
    "frontend/src/App.tsx": "export const App = () => null;\n",
    "Dockerfile": "FROM eclipse-temurin:21\n",
    "k8s/deployment.yaml": "apiVersion: apps/v1\nkind: Deployment\nmetadata: {}\n",
    "db/schema.sql": "CREATE TABLE users (id INT PRIMARY KEY);\n",
}


def test_small_project_ignores_junk_without_count_limit(service):
    """Fast equivalent of the Enterprise proof: 200 ignorable files + a small real
    app. Proves the Smart Ignore Engine works and that there is no fixed file-count
    limit, without dominating the suite."""
    data = _small_junk_zip(_REAL_APP, junk=200)

    result = service.ingest_zip(data)
    stats = result.stats

    assert stats.files_found == 200 + len(_REAL_APP)
    assert stats.analyzable_count == len(_REAL_APP)  # only real code is analyzed
    assert stats.ignored_count == 200  # node_modules / .git / build dropped
    assert stats.truncated is False

    indexed = list(service.iter_files(result.ingest_id))
    assert len(indexed) == len(_REAL_APP)
    assert not any(
        "node_modules" in rel or rel.startswith(".git") or rel.startswith("build/")
        for rel, _a, _l in indexed
    )
    assert "java" in stats.languages and "typescript" in stats.languages
    assert "Spring Boot" in stats.frameworks
    assert stats.lines_of_code > 0


@pytest.mark.slow
@pytest.mark.enterprise
def test_enterprise_zip_over_100k_files_ignores_junk_and_analyzes(service):
    data = _enterprise_zip(_REAL_APP)

    result = service.ingest_zip(data)  # must NOT raise on a 100k+ file archive
    stats = result.stats

    assert stats.files_found >= 100_000
    assert stats.analyzable_count == len(_REAL_APP)
    assert stats.ignored_count == stats.files_found - stats.analyzable_count
    assert stats.truncated is False

    # Only the real code was extracted — node_modules / .git / target never reach the AI.
    indexed = list(service.iter_files(result.ingest_id))
    assert len(indexed) == len(_REAL_APP)
    assert not any("node_modules" in rel or "/target/" in rel or rel.startswith(".git") for rel, _a, _l in indexed)

    assert "java" in stats.languages and "typescript" in stats.languages
    assert stats.lines_of_code > 0
    for framework in ("Spring Boot", "React", "Docker", "Kubernetes"):
        assert framework in stats.frameworks, stats.frameworks
    assert stats.complexity in {"Baixa", "Média", "Alta", "Muito alta (Enterprise)"}


def test_no_fixed_file_count_limit_for_relevant_files(service):
    # The old engine rejected > 5000 files outright. Now 8000 relevant files ingest fine.
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_STORED) as zf:
        for i in range(8_000):
            zf.writestr(f"src/module_{i}.py", f"def f_{i}():\n    return {i}\n")
    result = service.ingest_zip(buffer.getvalue())
    assert result.stats.analyzable_count == 8_000
    assert result.stats.truncated is False


def test_analyzable_byte_cap_truncates_gracefully(service):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_STORED) as zf:
        for i in range(50):
            zf.writestr(f"src/file_{i}.py", "x = 1\n" * 50)  # ~300 bytes each

    settings = get_settings()
    previous = settings.modernize_max_analyzable_bytes
    settings.modernize_max_analyzable_bytes = 500  # only ~1-2 files fit
    try:
        result = service.ingest_zip(buffer.getvalue())  # cap reached -> graceful, not an error
        assert result.stats.truncated is True
        assert 0 < result.stats.analyzable_count < 50
    finally:
        settings.modernize_max_analyzable_bytes = previous


def test_ingest_report_surfaced_via_route(client):
    # Uses the small fixture so the route+report path stays in the fast suite.
    data = _small_junk_zip(_REAL_APP, junk=200)
    response = client.post(
        "/api/modernize/ingest/zip",
        files={"file": ("project.zip", data, "application/zip")},
    )
    assert response.status_code == 200, response.text
    stats = response.json()["stats"]
    assert stats["files_found"] == 200 + len(_REAL_APP)
    assert stats["ignored_count"] == 200
    assert stats["analyzable_count"] == len(_REAL_APP)
    assert "Spring Boot" in stats["frameworks"]
    assert stats["lines_of_code"] > 0

@pytest.mark.parametrize(
    ("field", "value", "files", "message"),
    [
        ("modernize_max_archive_entries", 1, {"a.py": "x", "b.py": "x"}, "too many entries"),
        ("modernize_max_archive_uncompressed_bytes", 1, {"a.py": "xx"}, "declared size"),
        ("modernize_max_archive_depth", 2, {"a/b/c.py": "x"}, "path depth"),
        ("modernize_max_archive_name_bytes", 8, {"overlong-name.py": "x"}, "overlong entry name"),
    ],
)
def test_archive_manifest_security_limits(service, field, value, files, message):
    settings = get_settings()
    previous = getattr(settings, field)
    setattr(settings, field, value)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    try:
        with pytest.raises(CodebaseIngestError, match=message):
            service.ingest_zip(buffer.getvalue())
    finally:
        setattr(settings, field, previous)


@pytest.mark.parametrize(
    "url",
    [
        "https://127.0.0.1/repository.git",
        "https://169.254.169.254/latest/meta-data.git",
        "https://user:secret@github.com/org/repository.git",
        "https://github.com:8443/org/repository.git",
        "https://github.com/org/repository.git?redirect=internal",
        "ssh://github.com/org/repository.git",
    ],
)
def test_git_ingest_rejects_unapproved_or_ambiguous_urls(service, url):
    with pytest.raises(CodebaseIngestError):
        service.ingest_git(url)