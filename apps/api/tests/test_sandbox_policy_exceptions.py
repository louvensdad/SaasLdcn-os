from __future__ import annotations

import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest

from app.core.config import Settings, get_settings
from app.core.security import decode_token
from app.repositories.sandbox_policy_exception_repository import SandboxPolicyExceptionRepository
from app.services.execution_runtime import ExecutionRequest, SandboxExecutionRuntime
from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter


def _sandbox_settings(tmp_path: Path) -> Settings:
    return Settings(
        environment="test", execution_runtime="sandbox", allow_host_execution=False,
        sandbox_evidence_root=tmp_path / "evidence", sandbox_egress_network="", sandbox_egress_proxy="",
    )


def _repo() -> SandboxPolicyExceptionRepository:
    return SandboxPolicyExceptionRepository(get_settings().sqlite_path)


def _iso(delta: timedelta) -> str:
    return (datetime.now(timezone.utc) + delta).isoformat()


# --------------------------------------------------------------- _validate_request wiring

def test_unknown_program_is_denied_without_an_exception(client, tmp_path):
    runtime = SandboxExecutionRuntime(_sandbox_settings(tmp_path))
    reason = runtime._validate_request(ExecutionRequest(command=("terraform", "apply"), project_id="proj-1"))
    assert "not in the execution policy" in reason


def test_unknown_program_is_allowed_with_a_live_exception(client, tmp_path):
    _repo().create(project_id="proj-1", program="terraform", reason="IaC step", approved_by_user_id="admin-1", expires_at=_iso(timedelta(hours=1)))
    runtime = SandboxExecutionRuntime(_sandbox_settings(tmp_path))
    reason = runtime._validate_request(ExecutionRequest(command=("terraform", "apply"), project_id="proj-1"))
    assert reason == ""


def test_exception_is_scoped_to_its_own_project(client, tmp_path):
    _repo().create(project_id="proj-1", program="terraform", reason="IaC step", approved_by_user_id="admin-1", expires_at=_iso(timedelta(hours=1)))
    runtime = SandboxExecutionRuntime(_sandbox_settings(tmp_path))
    reason = runtime._validate_request(ExecutionRequest(command=("terraform", "apply"), project_id="proj-OTHER"))
    assert "not in the execution policy" in reason


def test_expired_exception_no_longer_allows(client, tmp_path):
    _repo().create(project_id="proj-1", program="terraform", reason="IaC step", approved_by_user_id="admin-1", expires_at=_iso(timedelta(hours=-1)))
    runtime = SandboxExecutionRuntime(_sandbox_settings(tmp_path))
    reason = runtime._validate_request(ExecutionRequest(command=("terraform", "apply"), project_id="proj-1"))
    assert "not in the execution policy" in reason


def test_revoked_exception_no_longer_allows(client, tmp_path):
    row = _repo().create(project_id="proj-1", program="terraform", reason="IaC step", approved_by_user_id="admin-1", expires_at=_iso(timedelta(hours=1)))
    _repo().revoke(row["id"])
    runtime = SandboxExecutionRuntime(_sandbox_settings(tmp_path))
    reason = runtime._validate_request(ExecutionRequest(command=("terraform", "apply"), project_id="proj-1"))
    assert "not in the execution policy" in reason


def test_a_hard_blocked_program_is_never_overridable_by_an_exception(client, tmp_path):
    _repo().create(project_id="proj-1", program="bash", reason="please", approved_by_user_id="admin-1", expires_at=_iso(timedelta(hours=1)))
    runtime = SandboxExecutionRuntime(_sandbox_settings(tmp_path))
    reason = runtime._validate_request(ExecutionRequest(command=("bash", "-c", "id"), project_id="proj-1"))
    assert "forbidden" in reason


# --------------------------------------------------------------- route-level authorization

def _register(client, label: str) -> tuple[str, str]:
    email_label = label.lower().replace(" ", "-")
    response = client.post(
        "/api/auth/register",
        json={"email": f"{email_label}_{uuid4().hex}@example.com", "password": "TestPassword123!", "full_name": label, "privacy_policy_accepted": True},
    )
    assert response.status_code == 201
    token = response.json()["tokens"]["access_token"]
    user_id = str(decode_token(token, expected_type="access")["sub"])
    return token, user_id


def _create_shared_workspace(client) -> str:
    organization = client.post("/api/organizations", json={"name": f"Acme {uuid4().hex[:8]}"})
    assert organization.status_code == 201
    workspace = client.post(f"/api/organizations/{organization.json()['organization_id']}/workspaces", json={"name": "Shared"})
    assert workspace.status_code == 201
    return workspace.json()["workspace_id"]


def _add_member(client, workspace_id: str, user_id: str, role: str) -> None:
    response = client.put(f"/api/workspaces/{workspace_id}/members/{user_id}", json={"role": role})
    assert response.status_code == 200, response.text


@pytest.fixture
def owned_project():
    created: list[Path] = []
    writer = ProjectWriter()

    def _make(*, owner: str, workspace_id: str | None = None) -> str:
        result = writer.write([EmittedFile(path="README.md", content="# x")], project_name="sandbox-exception-test", owner=owner, workspace_id=workspace_id)
        created.append(Path(result.root_path))
        return result.project_id

    yield _make
    for root in created:
        shutil.rmtree(root, ignore_errors=True)


_VALID_PAYLOAD = {"program": "terraform", "reason": "IaC provisioning step", "expires_at": None}


def _payload(project_id: str, **overrides) -> dict:
    body = {**_VALID_PAYLOAD, "project_id": project_id, "expires_at": _iso(timedelta(hours=6))}
    body.update(overrides)
    return body


def test_owner_can_grant_an_exception_on_their_own_project(client, owned_project):
    owner_user_id = client.get("/api/auth/me").json()["user_id"]
    project_id = owned_project(owner=owner_user_id)

    response = client.post("/api/execution/policy-exceptions", json=_payload(project_id))
    assert response.status_code == 201
    body = response.json()
    assert body["program"] == "terraform"
    assert body["approved_by_user_id"] == owner_user_id


def test_non_owner_non_admin_cannot_grant_an_exception(client, owned_project):
    owner_user_id = client.get("/api/auth/me").json()["user_id"]
    workspace_id = _create_shared_workspace(client)
    project_id = owned_project(owner=owner_user_id, workspace_id=workspace_id)
    dev_token, dev_id = _register(client, "Dev Not Admin")
    _add_member(client, workspace_id, dev_id, "developer")

    response = client.post(
        "/api/execution/policy-exceptions",
        headers={"Authorization": f"Bearer {dev_token}"},
        json=_payload(project_id),
    )
    assert response.status_code == 404


def test_workspace_admin_can_grant_an_exception_on_a_teammates_project(client, owned_project):
    owner_user_id = client.get("/api/auth/me").json()["user_id"]
    workspace_id = _create_shared_workspace(client)
    project_id = owned_project(owner=owner_user_id, workspace_id=workspace_id)
    admin_token, admin_id = _register(client, "Workspace Admin")
    _add_member(client, workspace_id, admin_id, "admin")

    response = client.post(
        "/api/execution/policy-exceptions",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=_payload(project_id),
    )
    assert response.status_code == 201


def test_cannot_grant_an_exception_for_a_hard_blocked_program(client, owned_project):
    owner_user_id = client.get("/api/auth/me").json()["user_id"]
    project_id = owned_project(owner=owner_user_id)
    response = client.post("/api/execution/policy-exceptions", json=_payload(project_id, program="curl"))
    assert response.status_code == 422


def test_rejects_expires_at_in_the_past(client, owned_project):
    owner_user_id = client.get("/api/auth/me").json()["user_id"]
    project_id = owned_project(owner=owner_user_id)
    response = client.post("/api/execution/policy-exceptions", json=_payload(project_id, expires_at=_iso(timedelta(hours=-1))))
    assert response.status_code == 422


def test_rejects_expires_at_too_far_in_the_future(client, owned_project):
    owner_user_id = client.get("/api/auth/me").json()["user_id"]
    project_id = owned_project(owner=owner_user_id)
    response = client.post("/api/execution/policy-exceptions", json=_payload(project_id, expires_at=_iso(timedelta(days=90))))
    assert response.status_code == 422


def test_list_requires_admin_and_revoke_requires_admin_and_audits(client, owned_project):
    owner_user_id = client.get("/api/auth/me").json()["user_id"]
    workspace_id = _create_shared_workspace(client)
    project_id = owned_project(owner=owner_user_id, workspace_id=workspace_id)
    viewer_token, viewer_id = _register(client, "Viewer Teammate")
    _add_member(client, workspace_id, viewer_id, "viewer")

    created = client.post("/api/execution/policy-exceptions", json=_payload(project_id))
    exception_id = created.json()["id"]

    denied_list = client.get(
        "/api/execution/policy-exceptions", headers={"Authorization": f"Bearer {viewer_token}"}, params={"project_id": project_id},
    )
    assert denied_list.status_code == 404

    own_list = client.get("/api/execution/policy-exceptions", params={"project_id": project_id})
    assert own_list.status_code == 200
    assert len(own_list.json()) == 1

    denied_revoke = client.delete(
        f"/api/execution/policy-exceptions/{exception_id}", headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert denied_revoke.status_code == 404

    revoked = client.delete(f"/api/execution/policy-exceptions/{exception_id}")
    assert revoked.status_code == 200
    assert revoked.json()["revoked_at"] is not None

    events = client.get("/api/activity-feed", params={"category": "sandbox_policy", "workspace_id": workspace_id}).json()["items"]
    actions = {(e["action"]) for e in events}
    assert {"exception_granted", "exception_revoked"}.issubset(actions)


def test_revoking_an_already_revoked_exception_is_a_conflict(client, owned_project):
    owner_user_id = client.get("/api/auth/me").json()["user_id"]
    project_id = owned_project(owner=owner_user_id)
    created = client.post("/api/execution/policy-exceptions", json=_payload(project_id))
    exception_id = created.json()["id"]

    first = client.delete(f"/api/execution/policy-exceptions/{exception_id}")
    assert first.status_code == 200
    second = client.delete(f"/api/execution/policy-exceptions/{exception_id}")
    assert second.status_code == 409
