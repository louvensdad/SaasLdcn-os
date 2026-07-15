from __future__ import annotations

import importlib.util
import shutil
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.schemas.functional_coverage import ApplicationFunctionalCoverage, FunctionalCoverageFinding, FunctionalCoverageReport
from app.services.execution_runtime import ExecutionResult, ExecutionStatus, RuntimeLimits
from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter
from app.services.runtime_functional_test_service import RuntimeFunctionalTestService
import app.services.runtime_functional_test_service as svc

_PLAYWRIGHT_AVAILABLE = importlib.util.find_spec("playwright") is not None


@pytest.fixture
def make_project():
    created: list[Path] = []
    writer = ProjectWriter()

    def _make(files: list[tuple[str, str]], name: str = "runtime-functional-test") -> dict:
        result = writer.write([EmittedFile(path=p, content=c) for p, c in files], project_name=name)
        created.append(Path(result.root_path))
        return {"project_id": result.project_id, "project_name": name, "generated_project_path": result.root_path}

    yield _make
    for root in created:
        shutil.rmtree(root, ignore_errors=True)


def test_supported_false_when_host_execution_construction_is_rejected():
    def _raise() -> None:
        raise RuntimeError("Host execution requires EXECUTION_RUNTIME=host and ALLOW_HOST_EXECUTION=true.")

    service = RuntimeFunctionalTestService(host_runtime_factory=_raise)

    report = service.run({"project_id": "p1"})

    assert report.supported is False
    assert "ALLOW_HOST_EXECUTION" in report.reason


def test_supported_false_for_a_non_python_or_non_nextjs_project(make_project):
    project = make_project([("README.md", "# hi")], name="bare-project")

    service = RuntimeFunctionalTestService(host_runtime_factory=lambda: SimpleNamespace())

    report = service.run(project)

    assert report.supported is False
    assert "Python/FastAPI" in report.reason


def test_routes_to_visit_dedupes_and_always_includes_root():
    coverage = FunctionalCoverageReport(
        project_id="p1",
        generated_at="2026-07-15T00:00:00+00:00",
        frontend=ApplicationFunctionalCoverage(
            application="frontend",
            findings=[
                FunctionalCoverageFinding(id="f1", category="x", confidence="informational", file="apps/web/app/produtos/page.tsx", detail=""),
                FunctionalCoverageFinding(id="f2", category="x", confidence="informational", file="apps/web/app/produtos/page.tsx", detail=""),
                FunctionalCoverageFinding(id="f3", category="x", confidence="informational", file="apps/web/app/(marketing)/sobre/page.tsx", detail=""),
                FunctionalCoverageFinding(id="f4", category="x", confidence="informational", file="apps/web/app/produtos/[id]/page.tsx", detail=""),
                FunctionalCoverageFinding(id="f5", category="x", confidence="informational", file=None, detail=""),
            ],
        ),
    )
    service = RuntimeFunctionalTestService(host_runtime_factory=lambda: SimpleNamespace())

    routes = service._routes_to_visit(coverage)

    assert routes == ["/", "/produtos", "/sobre"]


class _StubPage:
    def __init__(self, *, url: str, status: int = 200, console_msgs=(), pageerrors=(), failed=(), goto_error: Exception | None = None):
        self.url = url
        self._status = status
        self._console_msgs = console_msgs
        self._pageerrors = pageerrors
        self._failed = failed
        self._goto_error = goto_error
        self._handlers: dict[str, object] = {}
        self.screenshot_calls: list[str] = []

    def on(self, event, handler):
        self._handlers[event] = handler

    def goto(self, url, timeout=None, wait_until=None):
        if self._goto_error:
            raise self._goto_error
        for kind, text in self._console_msgs:
            self._handlers["console"](SimpleNamespace(type=kind, text=text))
        for err in self._pageerrors:
            self._handlers["pageerror"](err)
        for method, resp_url, status in self._failed:
            self._handlers["response"](SimpleNamespace(request=SimpleNamespace(method=method), url=resp_url, status=status))
        return SimpleNamespace(status=self._status)

    def screenshot(self, *, path, full_page=True):
        Path(path).write_bytes(b"")
        self.screenshot_calls.append(path)

    def close(self):
        return


class _StubBrowser:
    def __init__(self, page: _StubPage) -> None:
        self._page = page

    def new_page(self):
        return self._page


def test_visit_route_redirect_to_login_is_not_a_failure(tmp_path):
    service = RuntimeFunctionalTestService(host_runtime_factory=lambda: SimpleNamespace())
    page = _StubPage(url="http://127.0.0.1:3000/login")
    browser = _StubBrowser(page)

    check = service._visit_route(browser, 3000, "/dashboard", tmp_path)

    assert check.ok is True
    assert check.redirected_to == "/login"
    assert Path(check.screenshot_path).is_file()


def test_visit_route_with_server_error_response_is_a_failure(tmp_path):
    service = RuntimeFunctionalTestService(host_runtime_factory=lambda: SimpleNamespace())
    page = _StubPage(url="http://127.0.0.1:3000/produtos", failed=[("GET", "http://127.0.0.1:8000/api/produtos", 500)])
    browser = _StubBrowser(page)

    check = service._visit_route(browser, 3000, "/produtos", tmp_path)

    assert check.ok is False
    assert check.network_failures == ["GET http://127.0.0.1:8000/api/produtos -> 500"]


def test_visit_route_with_console_pageerror_is_a_failure(tmp_path):
    service = RuntimeFunctionalTestService(host_runtime_factory=lambda: SimpleNamespace())
    page = _StubPage(url="http://127.0.0.1:3000/", pageerrors=[RuntimeError("TypeError: x is not a function")])
    browser = _StubBrowser(page)

    check = service._visit_route(browser, 3000, "/", tmp_path)

    assert check.ok is False
    assert any("TypeError" in message for message in check.console_errors)


def test_visit_route_navigation_failure_is_recorded_not_raised(tmp_path):
    service = RuntimeFunctionalTestService(host_runtime_factory=lambda: SimpleNamespace())
    page = _StubPage(url="http://127.0.0.1:3000/", goto_error=TimeoutError("navigation timeout"))
    browser = _StubBrowser(page)

    check = service._visit_route(browser, 3000, "/", tmp_path)

    assert check.ok is False
    assert "navigation timeout" in check.detail


def test_teardown_stops_both_background_processes_even_if_the_browser_pass_raises(make_project, monkeypatch):
    project = make_project(
        [
            ("requirements.txt", "fastapi\nuvicorn\n"),
            ("app/__init__.py", ""),
            ("app/main.py", "from fastapi import FastAPI\napp = FastAPI()\n"),
            ("apps/web/package.json", '{"dependencies": {"next": "14.0.0", "react": "18.0.0", "react-dom": "18.0.0"}}'),
        ],
        name="full-stack",
    )
    root = Path(project["generated_project_path"])
    started: list[str] = []
    stopped: list[str] = []

    def _start_background(sandbox_id, command, *, cwd, log_path, extra_env=None):
        handle_id = f"bg_{len(started)}"
        started.append(handle_id)
        return handle_id

    fake_runtime = SimpleNamespace(
        _sessions={"hostdev_fake": {"root": str(root)}},
        evidence_root=root / "_evidence",
        open_session=lambda workspace, **kw: "hostdev_fake",
        close_session=lambda sandbox_id: None,
        default_limits=lambda timeout_seconds=None: RuntimeLimits(timeout_seconds=timeout_seconds or 60),
        execute=lambda sandbox_id, request, **kw: ExecutionResult(
            execution_id="e", sandbox_id=sandbox_id, status=ExecutionStatus.SUCCEEDED, command="",
            cwd=request.cwd, image="fake", started_at="", finished_at="", exit_code=0,
        ),
        start_background=_start_background,
        stop_background=lambda handle_id: stopped.append(handle_id),
        tail_background=lambda handle_id, **kw: "",
    )
    service = RuntimeFunctionalTestService(host_runtime_factory=lambda: fake_runtime)
    monkeypatch.setattr(svc, "_wait_ready", lambda url, **kw: True)
    monkeypatch.setattr(service, "_run_browser_pass", lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("browser boom")))

    with pytest.raises(RuntimeError, match="browser boom"):
        service.run(project)

    assert started == ["bg_0", "bg_1"]
    assert sorted(stopped) == ["bg_0", "bg_1"]


def test_run_browser_pass_reports_unsupported_reason_when_playwright_is_missing(monkeypatch, tmp_path):
    if _PLAYWRIGHT_AVAILABLE:
        pytest.skip("playwright is installed in this environment; this covers the not-installed path.")
    service = RuntimeFunctionalTestService(host_runtime_factory=lambda: SimpleNamespace())

    checks, reason = service._run_browser_pass(3000, ["/"], tmp_path)

    assert checks == []
    assert "playwright" in reason
