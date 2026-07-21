from __future__ import annotations

import shutil
import time
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.routes import live_preview as live_preview_route
from app.services.execution_runtime import ExecutionResult, ExecutionStatus, RuntimeLimits
from app.services.file_protocol import EmittedFile
from app.services.live_preview_service import LivePreviewAccessError, LivePreviewService
from app.services.project_writer import ProjectWriter
import app.services.live_preview_service as svc


@pytest.fixture
def make_project():
    created: list[Path] = []
    writer = ProjectWriter()

    def _make(files: list[tuple[str, str]], name: str = "live-preview-test", owner: str | None = None) -> dict:
        result = writer.write([EmittedFile(path=p, content=c) for p, c in files], project_name=name, owner=owner)
        created.append(Path(result.root_path))
        return {"project_id": result.project_id, "project_name": name, "generated_project_path": result.root_path}

    yield _make
    for root in created:
        shutil.rmtree(root, ignore_errors=True)


def _fake_runtime(root: Path, *, started: list[str] | None = None, stopped: list[str] | None = None) -> SimpleNamespace:
    started = started if started is not None else []
    stopped = stopped if stopped is not None else []

    def _start_background(sandbox_id, command, *, cwd, log_path, extra_env=None):
        handle_id = f"bg_{len(started)}"
        started.append(handle_id)
        return handle_id

    return SimpleNamespace(
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


_FULL_STACK_FILES = [
    ("requirements.txt", "fastapi\nuvicorn\n"),
    ("app/__init__.py", ""),
    ("app/main.py", "from fastapi import FastAPI\napp = FastAPI()\n"),
    ("apps/web/package.json", '{"dependencies": {"next": "14.0.0", "react": "18.0.0", "react-dom": "18.0.0"}}'),
]

# Every unit test below fakes the backend/frontend process pair -- none of
# them should also pay for a real Chromium launch. Only the dedicated
# inspector tests further down inject a real/fake PreviewInspector on purpose.
_NO_INSPECTOR = lambda url: None  # noqa: E731


class _FakeInspector:
    def __init__(self) -> None:
        self.console: list[dict[str, str]] = [{"type": "error", "text": "boom", "at": "2026-07-20T00:00:00+00:00"}]
        self.navigated_to: list[str] = []
        self.reloaded = False
        self.stopped = False
        self.raise_on: set[str] = set()

    def snapshot_console(self) -> list[dict[str, str]]:
        return self.console

    def screenshot(self) -> bytes:
        if "screenshot" in self.raise_on:
            from app.services.preview_inspector import PreviewInspectorError
            raise PreviewInspectorError("browser crashed")
        return b"\x89PNG\r\n"

    def navigate(self, url: str) -> None:
        if "navigate" in self.raise_on:
            from app.services.preview_inspector import PreviewInspectorError
            raise PreviewInspectorError("navigation failed")
        self.navigated_to.append(url)

    def reload(self) -> None:
        self.reloaded = True

    def stop(self) -> None:
        self.stopped = True


# ------------------------------------------------------------------- unsupported


def test_unsupported_when_host_execution_construction_is_rejected(make_project):
    project = make_project(_FULL_STACK_FILES)
    service = LivePreviewService(host_runtime_factory=lambda: (_ for _ in ()).throw(RuntimeError("ALLOW_HOST_EXECUTION required")))

    result = service.start(project["project_id"], "user_a")

    assert result.status == "unsupported"
    assert "ALLOW_HOST_EXECUTION" in result.reason
    assert result.session_id == ""


def test_unsupported_for_a_non_python_or_non_nextjs_project(make_project):
    project = make_project([("README.md", "# hi")], name="bare-project")
    service = LivePreviewService(host_runtime_factory=lambda: SimpleNamespace())

    result = service.start(project["project_id"], "user_a")

    assert result.status == "unsupported"
    assert "Python/FastAPI" in result.reason


def test_unknown_project_raises_access_error_not_unsupported():
    service = LivePreviewService(host_runtime_factory=lambda: SimpleNamespace())

    with pytest.raises(LivePreviewAccessError):
        service.start("does-not-exist", "user_a")


# ------------------------------------------------------------------------ access


def test_access_error_when_project_owned_by_someone_else(make_project):
    project = make_project(_FULL_STACK_FILES, owner="user_a")
    service = LivePreviewService(host_runtime_factory=lambda: SimpleNamespace())

    with pytest.raises(LivePreviewAccessError):
        service.start(project["project_id"], "user_b")


# --------------------------------------------------------------------- lifecycle


def test_start_success_transitions_to_running_and_sets_preview_url(make_project, monkeypatch):
    project = make_project(_FULL_STACK_FILES)
    root = Path(project["generated_project_path"])
    fake = _fake_runtime(root)
    service = LivePreviewService(host_runtime_factory=lambda: fake, inspector_factory=_NO_INSPECTOR)
    monkeypatch.setattr(svc, "_wait_ready", lambda url, **kw: True)
    monkeypatch.setattr(svc, "_free_port", lambda: 45000)

    result = service.start(project["project_id"], "user_a")

    assert result.status == "running"
    assert result.session_id.startswith("lp_")
    assert result.preview_url == "http://127.0.0.1:45000/"


def test_start_replaces_any_existing_session_for_the_same_project(make_project, monkeypatch):
    project = make_project(_FULL_STACK_FILES)
    root = Path(project["generated_project_path"])
    stopped: list[str] = []
    fake = _fake_runtime(root, stopped=stopped)
    service = LivePreviewService(host_runtime_factory=lambda: fake, inspector_factory=_NO_INSPECTOR)
    monkeypatch.setattr(svc, "_wait_ready", lambda url, **kw: True)

    first = service.start(project["project_id"], "user_a")
    second = service.start(project["project_id"], "user_a")

    assert first.session_id != second.session_id
    assert service.get(first.session_id, "user_a") is None
    assert service.get(second.session_id, "user_a") is not None
    assert len(stopped) == 2  # first session's backend + frontend handles


def test_fail_when_backend_never_becomes_ready_stops_nothing_left_running(make_project, monkeypatch):
    project = make_project(_FULL_STACK_FILES)
    root = Path(project["generated_project_path"])
    started: list[str] = []
    stopped: list[str] = []
    fake = _fake_runtime(root, started=started, stopped=stopped)
    service = LivePreviewService(host_runtime_factory=lambda: fake, inspector_factory=_NO_INSPECTOR)
    monkeypatch.setattr(svc, "_wait_ready", lambda url, **kw: False)

    result = service.start(project["project_id"], "user_a")

    assert result.status == "failed"
    assert "startup budget" in result.reason
    assert started == stopped  # every background process that was started got stopped
    assert service.get(result.session_id, "user_a") is None


def test_fail_when_frontend_never_becomes_ready_stops_backend_too(make_project, monkeypatch):
    project = make_project(_FULL_STACK_FILES)
    root = Path(project["generated_project_path"])
    started: list[str] = []
    stopped: list[str] = []
    fake = _fake_runtime(root, started=started, stopped=stopped)
    service = LivePreviewService(host_runtime_factory=lambda: fake, inspector_factory=_NO_INSPECTOR)
    calls = {"n": 0}

    def _wait_ready(url, **kw):
        calls["n"] += 1
        return calls["n"] == 1  # first call (backend) succeeds, second (frontend) fails

    monkeypatch.setattr(svc, "_wait_ready", _wait_ready)

    result = service.start(project["project_id"], "user_a")

    assert result.status == "failed"
    assert len(started) == 2
    assert sorted(stopped) == sorted(started)


def test_active_count_for_owner_counts_across_projects_for_the_same_owner(make_project, monkeypatch):
    project_a = make_project(_FULL_STACK_FILES, name="preview-a")
    project_b = make_project(_FULL_STACK_FILES, name="preview-b")
    fake = _fake_runtime(Path(project_a["generated_project_path"]))
    service = LivePreviewService(host_runtime_factory=lambda: fake, inspector_factory=_NO_INSPECTOR)
    monkeypatch.setattr(svc, "_wait_ready", lambda url, **kw: True)
    monkeypatch.setattr(svc, "_free_port", lambda: 45100)

    assert service.active_count_for_owner("user_a") == 0
    service.start(project_a["project_id"], "user_a")
    assert service.active_count_for_owner("user_a") == 1
    service.start(project_b["project_id"], "user_a")
    assert service.active_count_for_owner("user_a") == 2
    assert service.active_count_for_owner("user_b") == 0


def test_active_count_for_owner_excludes_the_projects_own_session(make_project, monkeypatch):
    project = make_project(_FULL_STACK_FILES, name="preview-restart")
    fake = _fake_runtime(Path(project["generated_project_path"]))
    service = LivePreviewService(host_runtime_factory=lambda: fake, inspector_factory=_NO_INSPECTOR)
    monkeypatch.setattr(svc, "_wait_ready", lambda url, **kw: True)
    monkeypatch.setattr(svc, "_free_port", lambda: 45200)

    service.start(project["project_id"], "user_a")
    assert service.active_count_for_owner("user_a") == 1
    assert service.active_count_for_owner("user_a", exclude_project_id=project["project_id"]) == 0


def test_get_returns_none_for_wrong_owner(make_project, monkeypatch):
    project = make_project(_FULL_STACK_FILES)
    root = Path(project["generated_project_path"])
    fake = _fake_runtime(root)
    service = LivePreviewService(host_runtime_factory=lambda: fake, inspector_factory=_NO_INSPECTOR)
    monkeypatch.setattr(svc, "_wait_ready", lambda url, **kw: True)

    result = service.start(project["project_id"], "user_a")

    assert service.get(result.session_id, "user_b") is None
    assert service.get(result.session_id, "user_a") is not None


def test_stop_returns_false_for_unknown_session_or_wrong_owner(make_project, monkeypatch):
    project = make_project(_FULL_STACK_FILES)
    root = Path(project["generated_project_path"])
    fake = _fake_runtime(root)
    service = LivePreviewService(host_runtime_factory=lambda: fake, inspector_factory=_NO_INSPECTOR)
    monkeypatch.setattr(svc, "_wait_ready", lambda url, **kw: True)

    result = service.start(project["project_id"], "user_a")

    assert service.stop("unknown", "user_a") is False
    assert service.stop(result.session_id, "user_b") is False
    assert service.stop(result.session_id, "user_a") is True
    assert service.get(result.session_id, "user_a") is None


def test_idle_sessions_are_reaped_on_next_start(make_project, monkeypatch):
    project_a = make_project(_FULL_STACK_FILES, name="idle-a")
    project_b = make_project(_FULL_STACK_FILES, name="idle-b")
    root_a = Path(project_a["generated_project_path"])
    root_b = Path(project_b["generated_project_path"])
    stopped: list[str] = []
    service = LivePreviewService(host_runtime_factory=lambda: _fake_runtime(root_a, stopped=stopped), inspector_factory=_NO_INSPECTOR)
    monkeypatch.setattr(svc, "_wait_ready", lambda url, **kw: True)
    monkeypatch.setattr(svc, "IDLE_TIMEOUT_SECONDS", 0.01)

    first = service.start(project_a["project_id"], "user_a")
    time.sleep(0.05)

    service._host_runtime_factory = lambda: _fake_runtime(root_b, stopped=stopped)
    service.start(project_b["project_id"], "user_a")

    assert service.get(first.session_id, "user_a") is None


# ----------------------------------------------------------------------- inspector


def _running_service_with_inspector(make_project, monkeypatch, inspector: _FakeInspector) -> tuple[LivePreviewService, str]:
    project = make_project(_FULL_STACK_FILES)
    root = Path(project["generated_project_path"])
    fake = _fake_runtime(root)
    service = LivePreviewService(host_runtime_factory=lambda: fake, inspector_factory=lambda url: inspector)
    monkeypatch.setattr(svc, "_wait_ready", lambda url, **kw: True)
    monkeypatch.setattr(svc, "_free_port", lambda: 45500)
    result = service.start(project["project_id"], "user_a")
    assert result.status == "running"
    return service, result.session_id


def test_console_log_is_none_when_session_has_no_inspector(make_project, monkeypatch):
    service, session_id = _running_service_with_inspector(make_project, monkeypatch, _FakeInspector())
    service._sessions[session_id].inspector = None

    assert service.console_log(session_id, "user_a") is None


def test_console_log_returns_the_inspector_buffer(make_project, monkeypatch):
    inspector = _FakeInspector()
    service, session_id = _running_service_with_inspector(make_project, monkeypatch, inspector)

    assert service.console_log(session_id, "user_a") == inspector.console
    assert service.console_log(session_id, "user_b") is None  # wrong owner


def test_screenshot_returns_bytes_from_the_inspector(make_project, monkeypatch):
    inspector = _FakeInspector()
    service, session_id = _running_service_with_inspector(make_project, monkeypatch, inspector)

    assert service.screenshot(session_id, "user_a") == b"\x89PNG\r\n"


def test_screenshot_propagates_inspector_errors(make_project, monkeypatch):
    from app.services.preview_inspector import PreviewInspectorError

    inspector = _FakeInspector()
    inspector.raise_on.add("screenshot")
    service, session_id = _running_service_with_inspector(make_project, monkeypatch, inspector)

    with pytest.raises(PreviewInspectorError):
        service.screenshot(session_id, "user_a")


def test_navigate_targets_the_frontend_port_with_a_leading_slash(make_project, monkeypatch):
    inspector = _FakeInspector()
    service, session_id = _running_service_with_inspector(make_project, monkeypatch, inspector)

    assert service.navigate(session_id, "user_a", "produtos") is True
    assert inspector.navigated_to == ["http://127.0.0.1:45500/produtos"]


def test_navigate_returns_false_for_unknown_session(make_project, monkeypatch):
    service, _ = _running_service_with_inspector(make_project, monkeypatch, _FakeInspector())

    assert service.navigate("unknown", "user_a", "/") is False


def test_reload_calls_the_inspector_and_returns_true(make_project, monkeypatch):
    inspector = _FakeInspector()
    service, session_id = _running_service_with_inspector(make_project, monkeypatch, inspector)

    assert service.reload(session_id, "user_a") is True
    assert inspector.reloaded is True


def test_stop_also_stops_the_inspector(make_project, monkeypatch):
    inspector = _FakeInspector()
    service, session_id = _running_service_with_inspector(make_project, monkeypatch, inspector)

    assert service.stop(session_id, "user_a") is True
    assert inspector.stopped is True


# --------------------------------------------------------------------------- routes


def _register_and_login(client) -> tuple[str, str]:
    email = f"lp_{uuid4().hex}@example.com"
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "LivePreview123!", "full_name": "LP User", "privacy_policy_accepted": True},
    )
    assert response.status_code in (200, 201), response.text
    body = response.json()
    return body["user"]["user_id"], body["tokens"]["access_token"]


def test_route_start_unknown_project_is_404(client) -> None:
    response = client.post("/api/live-preview/start", json={"project_id": "does-not-exist"})
    assert response.status_code == 404


def test_route_start_missing_project_id_is_422(client) -> None:
    response = client.post("/api/live-preview/start", json={})
    assert response.status_code == 422


def test_route_get_and_stop_are_404_for_other_owner(client, make_project, monkeypatch) -> None:
    project = make_project(_FULL_STACK_FILES)
    root = Path(project["generated_project_path"])
    monkeypatch.setattr(svc, "_wait_ready", lambda url, **kw: True)
    monkeypatch.setattr(live_preview_route.live_preview_service, "_host_runtime_factory", lambda: _fake_runtime(root))
    monkeypatch.setattr(live_preview_route.live_preview_service, "_inspector_factory", _NO_INSPECTOR)

    started = live_preview_route.live_preview_service.start(project["project_id"], "user_a")
    assert started.status == "running"

    _, other_token = _register_and_login(client)
    headers = {"Authorization": f"Bearer {other_token}"}

    get_resp = client.get(f"/api/live-preview/{started.session_id}", headers=headers)
    assert get_resp.status_code == 404

    stop_resp = client.post(f"/api/live-preview/{started.session_id}/stop", headers=headers)
    assert stop_resp.status_code == 404

    live_preview_route.live_preview_service._stop_internal(started.session_id)


def _running_session_via_route(client, make_project, monkeypatch, inspector: _FakeInspector | None) -> tuple[str, dict[str, str]]:
    owner_id, token = _register_and_login(client)
    project = make_project(_FULL_STACK_FILES, owner=owner_id)
    root = Path(project["generated_project_path"])
    monkeypatch.setattr(svc, "_wait_ready", lambda url, **kw: True)
    monkeypatch.setattr(live_preview_route.live_preview_service, "_host_runtime_factory", lambda: _fake_runtime(root))
    monkeypatch.setattr(
        live_preview_route.live_preview_service, "_inspector_factory",
        _NO_INSPECTOR if inspector is None else (lambda url: inspector),
    )
    started = live_preview_route.live_preview_service.start(project["project_id"], owner_id)
    assert started.status == "running"
    return started.session_id, {"Authorization": f"Bearer {token}"}


def test_route_console_returns_the_buffered_entries(client, make_project, monkeypatch) -> None:
    inspector = _FakeInspector()
    session_id, headers = _running_session_via_route(client, make_project, monkeypatch, inspector)

    response = client.get(f"/api/live-preview/{session_id}/console", headers=headers)

    assert response.status_code == 200, response.text
    assert response.json() == inspector.console


def test_route_console_is_404_for_unknown_session(client) -> None:
    response = client.get("/api/live-preview/does-not-exist/console")
    assert response.status_code == 404


def test_route_screenshot_returns_png_bytes(client, make_project, monkeypatch) -> None:
    inspector = _FakeInspector()
    session_id, headers = _running_session_via_route(client, make_project, monkeypatch, inspector)

    response = client.post(f"/api/live-preview/{session_id}/screenshot", headers=headers)

    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "image/png"
    assert response.content == b"\x89PNG\r\n"


def test_route_screenshot_is_502_when_the_inspector_fails(client, make_project, monkeypatch) -> None:
    inspector = _FakeInspector()
    inspector.raise_on.add("screenshot")
    session_id, headers = _running_session_via_route(client, make_project, monkeypatch, inspector)

    response = client.post(f"/api/live-preview/{session_id}/screenshot", headers=headers)

    assert response.status_code == 502
    assert "browser crashed" in response.json()["error"]["message"]


def test_route_navigate_forwards_the_path_to_the_inspector(client, make_project, monkeypatch) -> None:
    inspector = _FakeInspector()
    session_id, headers = _running_session_via_route(client, make_project, monkeypatch, inspector)

    response = client.post(f"/api/live-preview/{session_id}/navigate", json={"path": "/checkout"}, headers=headers)

    assert response.status_code == 204, response.text
    assert inspector.navigated_to and inspector.navigated_to[0].endswith("/checkout")


def test_route_reload_is_404_for_a_session_with_no_inspector(client, make_project, monkeypatch) -> None:
    session_id, headers = _running_session_via_route(client, make_project, monkeypatch, None)

    response = client.post(f"/api/live-preview/{session_id}/reload", headers=headers)

    assert response.status_code == 404
    live_preview_route.live_preview_service._stop_internal(session_id)
