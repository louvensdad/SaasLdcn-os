from __future__ import annotations

import shutil
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

from app.routes import staging as staging_route
from app.services.execution_runtime import ExecutionResult, ExecutionStatus, RuntimeLimits
from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter
from app.services.staging_service import STAGING_VERSIONS_ROOT
import app.services.staging_service as svc
import pytest


@pytest.fixture
def make_project():
    created: list[Path] = []
    project_ids: list[str] = []
    writer = ProjectWriter()

    def _make(files: list[tuple[str, str]], name: str = "staging-route-test", owner: str | None = None) -> dict:
        result = writer.write([EmittedFile(path=p, content=c) for p, c in files], project_name=name, owner=owner)
        created.append(Path(result.root_path))
        project_ids.append(result.project_id)
        return {"project_id": result.project_id, "generated_project_path": result.root_path}

    yield _make
    for root in created:
        shutil.rmtree(root, ignore_errors=True)
    for project_id in project_ids:
        shutil.rmtree(STAGING_VERSIONS_ROOT / project_id, ignore_errors=True)


def _fake_runtime(root: Path) -> SimpleNamespace:
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
        start_background=lambda *a, **k: f"bg_{uuid4().hex[:6]}",
        stop_background=lambda handle_id: None,
        tail_background=lambda handle_id, **kw: "",
    )


_FULL_STACK_FILES = [
    ("requirements.txt", "fastapi\nuvicorn\n"),
    ("app/__init__.py", ""),
    ("app/main.py", "from fastapi import FastAPI\napp = FastAPI()\n"),
    ("apps/web/package.json", '{"dependencies": {"next": "14.0.0", "react": "18.0.0", "react-dom": "18.0.0"}}'),
]


def _register_and_login(client) -> str:
    email = f"staging_{uuid4().hex}@example.com"
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "Staging123!", "full_name": "Staging User", "privacy_policy_accepted": True},
    )
    assert response.status_code == 201
    return response.json()["tokens"]["access_token"]


def test_deploy_route_unknown_project_is_404(client):
    response = client.post("/api/staging/does-not-exist/deploy")
    assert response.status_code == 404


def test_deploy_get_health_stop_roundtrip(client, make_project, monkeypatch):
    project = make_project(_FULL_STACK_FILES)
    root = Path(project["generated_project_path"])
    monkeypatch.setattr(svc, "_wait_ready", lambda url, **kw: True)
    monkeypatch.setattr(svc, "_probe", lambda url: True)
    monkeypatch.setattr(staging_route.staging_service, "_host_runtime_factory", lambda: _fake_runtime(root))

    deployed = client.post(f"/api/staging/{project['project_id']}/deploy")
    assert deployed.status_code == 200
    assert deployed.json()["status"] == "running"

    fetched = client.get(f"/api/staging/{project['project_id']}")
    assert fetched.status_code == 200

    health = client.get(f"/api/staging/{project['project_id']}/health")
    assert health.status_code == 200
    assert health.json()["backend_healthy"] is True

    stopped = client.post(f"/api/staging/{project['project_id']}/stop")
    assert stopped.status_code == 204
    assert client.get(f"/api/staging/{project['project_id']}").json()["status"] == "stopped"


def test_rollback_route_without_a_previous_version_is_409(client, make_project, monkeypatch):
    project = make_project(_FULL_STACK_FILES)
    root = Path(project["generated_project_path"])
    monkeypatch.setattr(svc, "_wait_ready", lambda url, **kw: True)
    monkeypatch.setattr(staging_route.staging_service, "_host_runtime_factory", lambda: _fake_runtime(root))
    client.post(f"/api/staging/{project['project_id']}/deploy")

    response = client.post(f"/api/staging/{project['project_id']}/rollback")
    assert response.status_code == 409


def test_staging_is_owner_scoped(client, make_project, monkeypatch):
    project = make_project(_FULL_STACK_FILES)
    root = Path(project["generated_project_path"])
    monkeypatch.setattr(svc, "_wait_ready", lambda url, **kw: True)
    monkeypatch.setattr(staging_route.staging_service, "_host_runtime_factory", lambda: _fake_runtime(root))
    client.post(f"/api/staging/{project['project_id']}/deploy")

    other_token = _register_and_login(client)
    headers = {"Authorization": f"Bearer {other_token}"}

    assert client.get(f"/api/staging/{project['project_id']}", headers=headers).status_code == 404
    assert client.post(f"/api/staging/{project['project_id']}/stop", headers=headers).status_code == 404
