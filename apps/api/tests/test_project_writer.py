from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

import pytest

from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter, ProjectWriteError


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


def test_append_still_extends_a_published_project(output_root):
    writer = ProjectWriter(output_root=output_root)
    created = writer.write([EmittedFile("a.txt", "a")], project_name="Demo")
    appended = writer.append(created.project_id, [EmittedFile("b.txt", "b")])

    root = Path(appended.root_path)
    assert (root / "a.txt").is_file() and (root / "b.txt").is_file()
    assert set(appended.written) >= {"a.txt", "b.txt"}
