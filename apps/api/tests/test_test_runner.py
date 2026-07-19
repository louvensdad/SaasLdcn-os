from __future__ import annotations

import shutil
from pathlib import Path
from typing import Callable
from uuid import uuid4

import pytest

from app.routes import test_runner as test_runner_route
from app.services.execution_runtime import ExecutionResult, ExecutionStatus, RuntimeLimits
from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter
from app.services.test_runner_service import TestRunnerAccessError, TestRunnerService


@pytest.fixture
def make_project():
    created: list[Path] = []
    writer = ProjectWriter()

    def _make(files: list[tuple[str, str]], name: str = "test-runner-test", owner: str | None = None) -> dict:
        result = writer.write([EmittedFile(path=p, content=c) for p, c in files], project_name=name, owner=owner)
        created.append(Path(result.root_path))
        return {"project_id": result.project_id, "project_name": name, "generated_project_path": result.root_path}

    yield _make
    for root in created:
        shutil.rmtree(root, ignore_errors=True)


# Command-shape matchers, not substring matches -- "npm" becomes "npm.cmd" on
# Windows (breaking naive substring patterns), and "pytest" itself contains
# the substring "test", which would collide with a naive npm-test pattern.
def _is_venv_create(cmd: tuple[str, ...]) -> bool:
    return "python" in Path(cmd[0]).name.lower() and "venv" in cmd


def _is_pip_install(cmd: tuple[str, ...]) -> bool:
    return "pip" in Path(cmd[0]).name.lower() and "install" in cmd


def _is_pytest_run(cmd: tuple[str, ...]) -> bool:
    return "pytest" in cmd


def _is_npm_install(cmd: tuple[str, ...]) -> bool:
    return "npm" in Path(cmd[0]).name.lower() and "install" in cmd


def _is_npm_test(cmd: tuple[str, ...]) -> bool:
    return "npm" in Path(cmd[0]).name.lower() and "test" in cmd


class _ScriptedRuntime:
    """Fake ExecutionRuntime returning a canned ExecutionResult per command
    shape, so a realistic venv-create -> pip-install -> pytest-run (or
    npm-install -> npm-test) sequence can be exercised without a real
    subprocess. Falls back to a plain SUCCEEDED/exit_code=0 result."""

    def __init__(self, responses: dict[Callable[[tuple[str, ...]], bool], ExecutionResult] | None = None, *, open_session_error: Exception | None = None) -> None:
        self.responses = responses or {}
        self.open_session_error = open_session_error
        self.commands: list[tuple[str, ...]] = []
        self.closed = False

    def open_session(self, workspace, **kw):
        if self.open_session_error is not None:
            raise self.open_session_error
        return "sbx_fake"

    def close_session(self, sandbox_id):
        self.closed = True

    def default_limits(self, timeout_seconds=None):
        return RuntimeLimits(timeout_seconds=timeout_seconds or 60)

    def execute(self, sandbox_id, request, **kw):
        self.commands.append(request.command)
        for matcher, result in self.responses.items():
            if matcher(request.command):
                return result
        return ExecutionResult(
            execution_id="e", sandbox_id=sandbox_id, status=ExecutionStatus.SUCCEEDED, command=" ".join(request.command),
            cwd=request.cwd, image="fake", started_at="", finished_at="", exit_code=0,
        )


def _result(*, exit_code: int, stdout: str = "", stderr: str = "", status: ExecutionStatus = None) -> ExecutionResult:
    resolved_status = status or (ExecutionStatus.SUCCEEDED if exit_code == 0 else ExecutionStatus.FAILED)
    return ExecutionResult(
        execution_id="e", sandbox_id="sbx_fake", status=resolved_status, command="", cwd=".",
        image="fake", started_at="", finished_at="", exit_code=exit_code, stdout=stdout, stderr=stderr, duration_ms=42,
    )


_PYTHON_BACKEND_FILES = [
    ("requirements.txt", "fastapi\nuvicorn\npytest\n"),
    ("app/__init__.py", ""),
    ("app/main.py", "from fastapi import FastAPI\napp = FastAPI()\n"),
    ("tests/test_health.py", "def test_health():\n    assert True\n"),
]

_NODE_PROJECT_FILES = [
    ("apps/web/package.json", '{"name": "x", "scripts": {"test": "jest"}, "dependencies": {"next": "14.0.0"}}'),
]


# ------------------------------------------------------------------- access


def test_unknown_project_raises_access_error():
    service = TestRunnerService(runtime=_ScriptedRuntime())

    with pytest.raises(TestRunnerAccessError):
        service.run("does-not-exist", "user_a")


def test_access_error_when_project_owned_by_someone_else(make_project):
    project = make_project(_PYTHON_BACKEND_FILES, owner="user_a")
    service = TestRunnerService(runtime=_ScriptedRuntime())

    with pytest.raises(TestRunnerAccessError):
        service.run(project["project_id"], "user_b")


# --------------------------------------------------------------- unsupported


def test_unsupported_for_a_project_with_no_python_or_node(make_project):
    project = make_project([("README.md", "# hi")], name="bare-project")
    service = TestRunnerService(runtime=_ScriptedRuntime())

    report = service.run(project["project_id"], "user_a")

    assert report.status == "unsupported"
    assert report.suites == []


def test_unsupported_when_execution_runtime_construction_fails(make_project):
    project = make_project(_PYTHON_BACKEND_FILES)
    service = TestRunnerService(runtime=_ScriptedRuntime(open_session_error=RuntimeError("ALLOW_HOST_EXECUTION required")))

    report = service.run(project["project_id"], "user_a")

    assert report.status == "unsupported"
    assert "ALLOW_HOST_EXECUTION" in report.reason


# --------------------------------------------------------------------- pytest


def test_pytest_skipped_when_no_test_files(make_project):
    project = make_project([
        ("requirements.txt", "fastapi\n"), ("app/main.py", "x = 1\n"),
    ], name="no-tests")
    service = TestRunnerService(runtime=_ScriptedRuntime())

    report = service.run(project["project_id"], "user_a")

    assert len(report.suites) == 1
    assert report.suites[0].framework == "pytest"
    assert report.suites[0].status == "skipped"
    assert report.status == "partially_skipped"


def test_pytest_reports_passed_with_parsed_counts(make_project):
    project = make_project(_PYTHON_BACKEND_FILES)
    runtime = _ScriptedRuntime({
        _is_pytest_run: _result(exit_code=0, stdout="....\n3 passed in 0.10s\n"),
    })
    service = TestRunnerService(runtime=runtime)

    report = service.run(project["project_id"], "user_a")

    suite = report.suites[0]
    assert suite.status == "passed"
    assert suite.passed == 3
    assert suite.failed in (0, None)
    assert report.status == "passed"


def test_pytest_reports_failed_with_parsed_counts(make_project):
    project = make_project(_PYTHON_BACKEND_FILES)
    runtime = _ScriptedRuntime({
        _is_pytest_run: _result(exit_code=1, stdout="..F\n2 passed, 1 failed in 0.20s\n"),
    })
    service = TestRunnerService(runtime=runtime)

    report = service.run(project["project_id"], "user_a")

    suite = report.suites[0]
    assert suite.status == "failed"
    assert suite.passed == 2
    assert suite.failed == 1
    assert report.status == "failed"


def test_pytest_skipped_when_no_tests_collected(make_project):
    project = make_project(_PYTHON_BACKEND_FILES)
    runtime = _ScriptedRuntime({
        _is_pytest_run: _result(exit_code=5, stdout="no tests ran in 0.01s\n", status=ExecutionStatus.FAILED),
    })
    service = TestRunnerService(runtime=runtime)

    report = service.run(project["project_id"], "user_a")

    assert report.suites[0].status == "skipped"
    assert "coletado" in report.suites[0].reason


def test_pytest_skipped_when_module_not_installed(make_project):
    project = make_project(_PYTHON_BACKEND_FILES)
    runtime = _ScriptedRuntime({
        _is_pytest_run: _result(exit_code=1, stderr="ModuleNotFoundError: No module named pytest", status=ExecutionStatus.FAILED),
    })
    service = TestRunnerService(runtime=runtime)

    report = service.run(project["project_id"], "user_a")

    assert report.suites[0].status == "skipped"
    assert "pytest" in report.suites[0].reason.lower()


def test_pytest_error_when_venv_creation_fails(make_project):
    project = make_project(_PYTHON_BACKEND_FILES)
    runtime = _ScriptedRuntime({
        _is_venv_create: _result(exit_code=1, stderr="python: command not found", status=ExecutionStatus.FAILED),
    })
    service = TestRunnerService(runtime=runtime)

    report = service.run(project["project_id"], "user_a")

    assert report.suites[0].status == "error"
    assert report.status == "failed"


# ------------------------------------------------------------------ npm test


def test_npm_test_skipped_when_no_real_script(make_project):
    project = make_project([
        ("apps/web/package.json", '{"name": "x", "scripts": {"test": "echo \\"Error: no test specified\\" && exit 1"}}'),
    ], name="placeholder-script")
    service = TestRunnerService(runtime=_ScriptedRuntime())

    report = service.run(project["project_id"], "user_a")

    assert report.suites[0].framework == "npm"
    assert report.suites[0].status == "skipped"


def test_npm_test_reports_parsed_counts(make_project):
    project = make_project(_NODE_PROJECT_FILES)
    runtime = _ScriptedRuntime({
        _is_npm_test: _result(exit_code=1, stdout="Tests:       1 failed, 4 passed, 5 total\n"),
    })
    service = TestRunnerService(runtime=runtime)

    report = service.run(project["project_id"], "user_a")

    suite = report.suites[0]
    assert suite.framework == "npm"
    assert suite.status == "failed"
    assert suite.passed == 4
    assert suite.failed == 1


def test_npm_install_failure_is_reported_as_error(make_project):
    project = make_project(_NODE_PROJECT_FILES)
    runtime = _ScriptedRuntime({
        _is_npm_install: _result(exit_code=1, stderr="ETARGET", status=ExecutionStatus.FAILED),
    })
    service = TestRunnerService(runtime=runtime)

    report = service.run(project["project_id"], "user_a")

    assert report.suites[0].status == "error"


# ------------------------------------------------------------ full-stack mix


def test_both_suites_run_when_project_has_backend_and_frontend(make_project):
    project = make_project(_PYTHON_BACKEND_FILES + _NODE_PROJECT_FILES, name="full-stack")
    runtime = _ScriptedRuntime({
        _is_pytest_run: _result(exit_code=0, stdout="1 passed in 0.05s\n"),
        _is_npm_test: _result(exit_code=0, stdout="Tests:       2 passed, 2 total\n"),
    })
    service = TestRunnerService(runtime=runtime)

    report = service.run(project["project_id"], "user_a")

    assert {suite.framework for suite in report.suites} == {"pytest", "npm"}
    assert report.status == "passed"
    assert runtime.closed is True


# --------------------------------------------------------------------- routes


def _register_and_login(client) -> tuple[str, str]:
    email = f"tr_{uuid4().hex}@example.com"
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "TestRunner123!", "full_name": "TR User", "privacy_policy_accepted": True},
    )
    assert response.status_code in (200, 201), response.text
    body = response.json()
    return body["user"]["user_id"], body["tokens"]["access_token"]


def test_route_run_unknown_project_is_404(client) -> None:
    response = client.post("/api/test-runner/run", json={"project_id": "does-not-exist"})
    assert response.status_code == 404


def test_route_run_missing_project_id_is_422(client) -> None:
    response = client.post("/api/test-runner/run", json={})
    assert response.status_code == 422


def test_route_run_is_404_for_other_owner(client, make_project, monkeypatch) -> None:
    project = make_project(_PYTHON_BACKEND_FILES, owner="user_a")
    monkeypatch.setattr(test_runner_route.test_runner_service, "runtime", _ScriptedRuntime({
        _is_pytest_run: _result(exit_code=0, stdout="1 passed in 0.01s\n"),
    }))

    owner_response = test_runner_route.test_runner_service.run(project["project_id"], "user_a")
    assert owner_response.status == "passed"

    _, other_token = _register_and_login(client)
    response = client.post(
        "/api/test-runner/run", json={"project_id": project["project_id"]},
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert response.status_code == 404
