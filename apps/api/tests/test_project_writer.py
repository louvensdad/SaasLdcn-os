from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

import pytest

from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter, ProjectWriteError


def _windows_lock_error(path: str) -> PermissionError:
    # The error the antivirus/search-indexer race produces on Windows
    # ([WinError 5] Acesso negado on the staging dir during os.replace).
    exc = PermissionError(13, "Acesso negado", path)
    exc.winerror = 5
    return exc


@pytest.fixture
def output_root():
    # Self-managed temp dir (avoids the Windows pytest tmp_path PermissionError).
    root = Path(tempfile.mkdtemp(prefix="ldcn-writer-"))
    try:
        yield root
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_write_publishes_atomically_with_marker(output_root):
    writer = ProjectWriter(output_root=output_root)
    result = writer.write([EmittedFile("src/app.py", "print('ok')")], project_name="Demo")

    root = Path(result.root_path)
    assert root.is_dir()
    assert (root / ".ldcn-generation.json").is_file()
    assert (root / "src/app.py").read_text(encoding="utf-8") == "print('ok')"
    assert result.file_count == 1
    # No staging directory is left behind after a successful publish.
    assert not any(entry.name.startswith(".staging-") for entry in output_root.iterdir())


def test_write_failure_leaves_no_partial_project(output_root):
    writer = ProjectWriter(output_root=output_root)
    # The second file trips path-traversal protection AFTER the first was staged.
    files = [EmittedFile("ok.txt", "fine"), EmittedFile("../escape.txt", "boom")]

    with pytest.raises(ProjectWriteError):
        writer.write(files, project_name="Demo")

    # Atomic: nothing was published and the staging dir was cleaned up — the output
    # root must be completely empty (no half-written project, no staging leftover).
    assert list(output_root.iterdir()) == []


def test_publish_retries_through_transient_windows_lock(output_root, monkeypatch):
    # Regression: [WinError 5] on os.replace while the antivirus scans the fresh
    # staging dir must NOT fail the pipeline — the publish retries until the
    # lock clears.
    monkeypatch.setattr("app.services.fs_publish.time.sleep", lambda _s: None)
    real_replace = os.replace
    calls = {"n": 0}

    def flaky_replace(src, dst):
        calls["n"] += 1
        if calls["n"] <= 2:
            raise _windows_lock_error(str(src))
        return real_replace(src, dst)

    monkeypatch.setattr("app.services.fs_publish.os.replace", flaky_replace)
    writer = ProjectWriter(output_root=output_root)
    result = writer.write([EmittedFile("src/app.py", "print('ok')")], project_name="Demo")

    root = Path(result.root_path)
    assert calls["n"] == 3
    assert (root / "src/app.py").is_file()
    assert not any(entry.name.startswith(".staging-") for entry in output_root.iterdir())


def test_publish_falls_back_to_copy_when_lock_never_clears(output_root, monkeypatch):
    # If the rename stays blocked past every retry, the project is still
    # published (copy fallback) instead of discarding the whole generation.
    monkeypatch.setattr("app.services.fs_publish.time.sleep", lambda _s: None)

    def always_locked(src, dst):
        raise _windows_lock_error(str(src))

    monkeypatch.setattr("app.services.fs_publish.os.replace", always_locked)
    writer = ProjectWriter(output_root=output_root)
    result = writer.write([EmittedFile("src/app.py", "print('ok')")], project_name="Demo")

    root = Path(result.root_path)
    assert (root / "src/app.py").read_text(encoding="utf-8") == "print('ok')"
    assert (root / ".ldcn-generation.json").is_file()
    assert not any(entry.name.startswith(".staging-") for entry in output_root.iterdir())


def test_publish_reraises_non_transient_errors(output_root, monkeypatch):
    def broken_replace(src, dst):
        raise OSError("disk on fire")

    monkeypatch.setattr("app.services.fs_publish.os.replace", broken_replace)
    writer = ProjectWriter(output_root=output_root)

    with pytest.raises(OSError, match="disk on fire"):
        writer.write([EmittedFile("a.txt", "a")], project_name="Demo")
    # Atomic failure semantics are preserved: nothing published, staging cleaned.
    assert list(output_root.iterdir()) == []


def test_stale_staging_dirs_are_swept_on_write(output_root):
    stale = output_root / ".staging-old-run-deadbeef"
    stale.mkdir()
    (stale / "leftover.txt").write_text("x", encoding="utf-8")
    two_hours_ago = 2 * 60 * 60
    old = os.stat(stale).st_mtime - two_hours_ago
    os.utime(stale, (old, old))
    fresh = output_root / ".staging-current-run"
    fresh.mkdir()

    ProjectWriter(output_root=output_root).write([EmittedFile("a.txt", "a")], project_name="Demo")

    assert not stale.exists()  # old orphan swept
    assert fresh.exists()  # recent staging (possibly another live write) untouched


def test_append_still_extends_a_published_project(output_root):
    writer = ProjectWriter(output_root=output_root)
    created = writer.write([EmittedFile("a.txt", "a")], project_name="Demo")
    appended = writer.append(created.project_id, [EmittedFile("b.txt", "b")])

    root = Path(appended.root_path)
    assert (root / "a.txt").is_file() and (root / "b.txt").is_file()
    assert set(appended.written) >= {"a.txt", "b.txt"}


# --- territory-overwrite guard (audit finding #1) -------------------------
#
# A later pipeline stage (e.g. "docs") must not be able to silently overwrite
# a file an earlier stage (e.g. "qa") already wrote and that may have already
# passed validation. Coverage here is deliberately at the ProjectWriter.append
# level -- the actual write-time boundary -- not the parse-time warning that
# file_protocol.py already covers (test_meta_factory.py) and which stays
# advisory-only by design.

def test_append_refuses_out_of_territory_overwrite_of_existing_file(output_root):
    writer = ProjectWriter(output_root=output_root)
    created = writer.write(
        [EmittedFile("docs/security_review.md", "qa's real findings")], project_name="Demo"
    )

    result = writer.append(
        created.project_id,
        [EmittedFile("docs/security_review.md", "docs agent overwrite attempt")],
        agent_role="frontend",
    )

    # `written` is the cumulative file list for the project (see
    # test_append_still_extends_a_published_project), so the pre-existing path is
    # still reported -- what matters is that its content was never touched.
    assert result.territory_overwrites == ["docs/security_review.md"]
    on_disk = (output_root / created.project_id / "docs" / "security_review.md").read_text(encoding="utf-8")
    assert on_disk == "qa's real findings"


def test_append_allows_owning_agent_to_overwrite_its_own_file(output_root):
    writer = ProjectWriter(output_root=output_root)
    created = writer.write([EmittedFile("apps/api/main.py", "v1")], project_name="Demo")

    result = writer.append(
        created.project_id, [EmittedFile("apps/api/main.py", "v2")], agent_role="backend"
    )

    assert result.territory_overwrites == []
    assert result.written == ["apps/api/main.py"]
    on_disk = (output_root / created.project_id / "apps" / "api" / "main.py").read_text(encoding="utf-8")
    assert on_disk == "v2"


def test_append_still_allows_brand_new_out_of_territory_file(output_root):
    writer = ProjectWriter(output_root=output_root)
    created = writer.write([EmittedFile("README.md", "hello")], project_name="Demo")

    # "frontend" has no declared territory under apps/api/, but the path is NEW
    # (nothing to overwrite) -- must stay unrestricted, matching parse_agent_output's
    # own tolerance for idiomatic layouts that don't match monorepo prefixes.
    result = writer.append(
        created.project_id, [EmittedFile("apps/api/new_file.py", "new")], agent_role="frontend"
    )

    assert result.territory_overwrites == []
    assert "apps/api/new_file.py" in result.written


def test_append_without_agent_role_keeps_legacy_overwrite_behavior(output_root):
    writer = ProjectWriter(output_root=output_root)
    created = writer.write([EmittedFile("a.txt", "v1")], project_name="Demo")

    result = writer.append(created.project_id, [EmittedFile("a.txt", "v2")])

    assert result.territory_overwrites == []
    assert (output_root / created.project_id / "a.txt").read_text(encoding="utf-8") == "v2"
