from __future__ import annotations

import shutil
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.services.execution_runtime import ExecutionResult, ExecutionStatus, RuntimeLimits
from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter
from app.services.staging_service import STAGING_VERSIONS_ROOT, StagingAccessError, StagingService
import app.services.staging_service as svc


@pytest.fixture
def make_project():
    created: list[Path] = []
    project_ids: list[str] = []
    writer = ProjectWriter()

    def _make(files: list[tuple[str, str]], name: str = "staging-test", owner: str | None = None) -> dict:
        result = writer.write([EmittedFile(path=p, content=c) for p, c in files], project_name=name, owner=owner)
        created.append(Path(result.root_path))
        project_ids.append(result.project_id)
        return {"project_id": result.project_id, "generated_project_path": result.root_path}

    yield _make
    for root in created:
        shutil.rmtree(root, ignore_errors=True)
    for project_id in project_ids:
        shutil.rmtree(STAGING_VERSIONS_ROOT / project_id, ignore_errors=True)


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
        execute=lambda sandbox_id, request, **kw: ExecutionResult(
            execution_id="e", sandbox_id=sandbox_id, status=ExecutionStatus.SUCCEEDED, command="",
            cwd=request.cwd, image="fake", started_at="", finished_at="", exit_code=0,
        ),
        default_limits=lambda timeout_seconds=None: RuntimeLimits(timeout_seconds=timeout_seconds or 60),
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


# --------------------------------------------------------------------- access

def test_unknown_project_raises_access_error(client):
    service = StagingService(host_runtime_factory=lambda: SimpleNamespace())
    with pytest.raises(StagingAccessError):
        service.deploy("does-not-exist", "user_a")


def test_access_error_when_project_owned_by_someone_else(client, make_project):
    project = make_project(_FULL_STACK_FILES, owner="user_a")
    service = StagingService(host_runtime_factory=lambda: SimpleNamespace())
    with pytest.raises(StagingAccessError):
        service.deploy(project["project_id"], "user_b")


# -------------------------------------------------------------------- deploy

def test_deploy_success_snapshots_the_project_and_sets_preview_url(client, make_project, monkeypatch):
    project = make_project(_FULL_STACK_FILES)
    root = Path(project["generated_project_path"])
    fake = _fake_runtime(root)
    service = StagingService(host_runtime_factory=lambda: fake)
    monkeypatch.setattr(svc, "_wait_ready", lambda url, **kw: True)
    monkeypatch.setattr(svc, "_free_port", lambda: 45100)

    result = service.deploy(project["project_id"], "user_a")

    assert result.status == "running"
    assert result.preview_url == "http://127.0.0.1:45100/"
    assert result.current_version_id is not None
    assert result.can_rollback is False  # first deploy has no previous version
    version_dir = STAGING_VERSIONS_ROOT / project["project_id"] / result.current_version_id
    assert version_dir.is_dir()
    assert (version_dir / "requirements.txt").exists()


def test_deploy_failure_keeps_the_previous_healthy_version_running(client, make_project, monkeypatch):
    project = make_project(_FULL_STACK_FILES)
    root = Path(project["generated_project_path"])
    fake = _fake_runtime(root)
    service = StagingService(host_runtime_factory=lambda: fake)
    monkeypatch.setattr(svc, "_wait_ready", lambda url, **kw: True)

    first = service.deploy(project["project_id"], "user_a")
    assert first.status == "running"

    monkeypatch.setattr(svc, "_wait_ready", lambda url, **kw: False)  # second deploy's health check fails
    second = service.deploy(project["project_id"], "user_a")

    assert second.status == "running"  # first deployment's status is preserved
    assert second.current_version_id == first.current_version_id  # unchanged -- rollback never happened
    assert "failed health check" in second.reason


def test_second_deploy_prunes_snapshots_older_than_current_and_previous(client, make_project, monkeypatch):
    project = make_project(_FULL_STACK_FILES)
    root = Path(project["generated_project_path"])
    service = StagingService(host_runtime_factory=lambda: _fake_runtime(root))
    monkeypatch.setattr(svc, "_wait_ready", lambda url, **kw: True)

    first = service.deploy(project["project_id"], "user_a")
    second = service.deploy(project["project_id"], "user_a")
    third = service.deploy(project["project_id"], "user_a")

    remaining = {p.name for p in (STAGING_VERSIONS_ROOT / project["project_id"]).iterdir()}
    assert remaining == {second.current_version_id, third.current_version_id}
    assert first.current_version_id not in remaining


# ------------------------------------------------------------------ rollback

def test_rollback_swaps_current_and_previous(client, make_project, monkeypatch):
    project = make_project(_FULL_STACK_FILES)
    root = Path(project["generated_project_path"])
    service = StagingService(host_runtime_factory=lambda: _fake_runtime(root))
    monkeypatch.setattr(svc, "_wait_ready", lambda url, **kw: True)

    first = service.deploy(project["project_id"], "user_a")
    second = service.deploy(project["project_id"], "user_a")
    assert second.can_rollback is True

    rolled_back = service.rollback(project["project_id"], "user_a")
    assert rolled_back.status == "running"
    assert rolled_back.current_version_id == first.current_version_id
    assert rolled_back.previous_version_id == second.current_version_id


def test_rollback_without_a_previous_version_raises(client, make_project, monkeypatch):
    project = make_project(_FULL_STACK_FILES)
    root = Path(project["generated_project_path"])
    service = StagingService(host_runtime_factory=lambda: _fake_runtime(root))
    monkeypatch.setattr(svc, "_wait_ready", lambda url, **kw: True)

    service.deploy(project["project_id"], "user_a")
    with pytest.raises(StagingAccessError):
        service.rollback(project["project_id"], "user_a")


def test_rollback_for_unknown_project_returns_none(client):
    service = StagingService(host_runtime_factory=lambda: SimpleNamespace())
    assert service.rollback("does-not-exist", "user_a") is None


# --------------------------------------------------------------- health/stop

def test_health_check_reflects_a_running_deployment(client, make_project, monkeypatch):
    project = make_project(_FULL_STACK_FILES)
    root = Path(project["generated_project_path"])
    service = StagingService(host_runtime_factory=lambda: _fake_runtime(root))
    monkeypatch.setattr(svc, "_wait_ready", lambda url, **kw: True)
    service.deploy(project["project_id"], "user_a")

    monkeypatch.setattr(svc, "_probe", lambda url: True)
    result = service.health_check(project["project_id"], "user_a")
    assert result.backend_healthy is True
    assert result.frontend_healthy is True


def test_health_check_for_a_never_deployed_project_reports_unhealthy(client, make_project):
    project = make_project(_FULL_STACK_FILES)
    service = StagingService(host_runtime_factory=lambda: SimpleNamespace())
    # Never deployed -- repository has no row, so health_check returns None.
    assert service.health_check(project["project_id"], "user_a") is None


def test_stop_tears_down_the_running_session_but_keeps_snapshots(client, make_project, monkeypatch):
    project = make_project(_FULL_STACK_FILES)
    root = Path(project["generated_project_path"])
    stopped: list[str] = []
    service = StagingService(host_runtime_factory=lambda: _fake_runtime(root, stopped=stopped))
    monkeypatch.setattr(svc, "_wait_ready", lambda url, **kw: True)
    deployed = service.deploy(project["project_id"], "user_a")

    assert service.stop(project["project_id"], "user_a") is True
    assert len(stopped) == 2  # backend + frontend handles
    version_dir = STAGING_VERSIONS_ROOT / project["project_id"] / deployed.current_version_id
    assert version_dir.is_dir()  # snapshot survives a stop

    after_stop = service.get(project["project_id"], "user_a")
    assert after_stop.status == "stopped"
