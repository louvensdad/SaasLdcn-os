from __future__ import annotations

import shutil
import sys
from pathlib import Path

import pytest

from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter
from app.services.runtime_api_audit_service import RuntimeApiAuditService
from fake_execution_runtime import FakeExecutionRuntime

_MAIN_PY = """from fastapi import FastAPI

app = FastAPI()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/boom")
def boom():
    raise RuntimeError("boom")
"""

_OPENAPI_YAML = """openapi: 3.1.0
info:
  title: test
  version: "1.0.0"
paths:
  /health:
    get:
      responses:
        "200":
          description: ok
  /boom:
    get:
      responses:
        "200":
          description: ok
  /items/{id}:
    get:
      responses:
        "200":
          description: ok
"""


@pytest.fixture
def make_project():
    created: list[Path] = []
    writer = ProjectWriter()

    def _make(files: list[tuple[str, str]], name: str = "runtime-audit-test") -> dict:
        result = writer.write([EmittedFile(path=p, content=c) for p, c in files], project_name=name)
        created.append(Path(result.root_path))
        return {"project_id": result.project_id, "project_name": name, "generated_project_path": result.root_path}

    yield _make
    for root in created:
        shutil.rmtree(root, ignore_errors=True)


def _fastapi_project(make_project) -> dict:
    return make_project(
        [
            ("requirements.txt", "fastapi\nuvicorn\n"),
            ("app/__init__.py", ""),
            ("app/main.py", _MAIN_PY),
            ("openapi.yaml", _OPENAPI_YAML),
        ],
        name="fastapi-runtime",
    )


def test_reports_unsupported_for_a_non_python_project(make_project):
    project = make_project([("package.json", '{"name":"x"}')], name="node-project")

    report = RuntimeApiAuditService(runtime=FakeExecutionRuntime()).audit(project)

    assert report.supported is False
    assert report.language is None
    assert "Python" in report.reason


def test_prepares_an_ephemeral_venv_inside_the_sandbox(make_project):
    project = _fastapi_project(make_project)
    runtime = FakeExecutionRuntime()

    report = RuntimeApiAuditService(runtime=runtime).audit(project)

    assert report.supported is True
    assert report.language == "python"
    assert report.started is True
    assert any(request.command[:4] == ("python", "-m", "venv", ".ldcn-venv") for request in runtime.requests)


def test_get_only_endpoints_excludes_path_params_and_non_get(make_project):
    project = _fastapi_project(make_project)
    service = RuntimeApiAuditService()
    root = Path(project["generated_project_path"])

    endpoints = service._get_only_endpoints(service._load_openapi(root))

    assert ("GET", "/health") in endpoints
    assert ("GET", "/boom") in endpoints
    assert not any(path == "/items/{id}" for _, path in endpoints)  # unresolved path param -- skipped


def test_runs_the_sandbox_harness_and_detects_a_crashing_endpoint(make_project):
    project = _fastapi_project(make_project)
    service = RuntimeApiAuditService(runtime=FakeExecutionRuntime())

    report = service.audit(project)

    assert report.supported is True
    assert report.started is True
    assert report.ready is True, report.startup_log_tail
    by_path = {check.path: check for check in report.checks}
    assert by_path["/health"].ok is True
    assert by_path["/health"].status_code == 200
    assert by_path["/boom"].ok is False
    assert by_path["/boom"].status_code == 500
    assert report.crash_count == 1
    assert report.endpoints_total == 2
