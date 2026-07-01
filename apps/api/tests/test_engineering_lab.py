from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.engines.engineering_lab_engine import engineering_lab_engine
from app.services.project_writer import DEFAULT_OUTPUT_ROOT


def _project_root(project_id: str) -> Path:
    root = DEFAULT_OUTPUT_ROOT / project_id
    shutil.rmtree(root, ignore_errors=True)
    root.mkdir(parents=True)
    return root


def test_engineering_lab_overview_uses_real_project_files() -> None:
    project_id = "lab-test-project"
    root = _project_root(project_id)
    try:
        (root / "package.json").write_text(
            '{"scripts":{"build":"next build","test":"vitest"},"dependencies":{"next":"^15.0.0"}}',
            encoding="utf-8",
        )
        (root / "src").mkdir()
        (root / "src" / "api.ts").write_text("app.get('/health', () => {})\n", encoding="utf-8")
        (root / "Dockerfile").write_text("FROM node:22\n", encoding="utf-8")

        overview = engineering_lab_engine.overview(project_id)

        assert overview.project_id == project_id
        assert overview.file_count >= 3
        assert overview.line_count >= 3
        assert overview.dependency_count == 1
        assert overview.stack == "Node.js"
        assert overview.api_endpoints[0].method == "GET"
        assert overview.api_endpoints[0].path == "/health"
        assert "Dockerfile" in overview.containers
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_engineering_lab_terminal_rejects_unapproved_executable() -> None:
    project_id = "lab-test-terminal"
    root = _project_root(project_id)
    try:
        with pytest.raises(HTTPException) as exc:
            engineering_lab_engine.run_terminal(project_id, "not-allowed-tool --version", 1)

        assert exc.value.status_code == 400
    finally:
        shutil.rmtree(root, ignore_errors=True)
