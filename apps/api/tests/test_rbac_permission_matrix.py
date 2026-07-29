from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from uuid import uuid4

import pytest

from app.core.authorization import PermissionDeniedError, require_permission
from app.core.permissions import evaluate_permission
from app.core.security import decode_token
from app.engines.generation_job_engine import GenerationJobEngine
from app.repositories.generation_job_repository import GenerationJobRepository
from app.repositories.workspace_permission_repository import WorkspacePermissionRepository


@pytest.fixture
def client_scoped_engine(client):
    """Same fixture test_generation_job_pipeline.py's route-level tests use:
    GenerationJobRepository.create()'s membership check is a defense-in-depth
    read against whatever DB its engine is bound to, and the route module's
    default `generation_job_engine` is a singleton constructed at import time
    (before any per-test DB exists) -- this rebinds it to the client's DB."""
    from app.core.config import get_settings

    checkpoint_root = Path(tempfile.mkdtemp(prefix="ldcn-rbac-test-checkpoints-"))
    repository = GenerationJobRepository(get_settings().sqlite_path)
    engine = GenerationJobEngine(repository, checkpoint_root)
    try:
        yield engine
    finally:
        shutil.rmtree(checkpoint_root, ignore_errors=True)


# --------------------------------------------------------------- evaluate_permission (pure)

def test_owner_admin_developer_allowed_reviewer_viewer_denied_for_execute_build():
    for role in ("owner", "admin", "developer", "member"):  # "member" is the legacy alias
        decision = evaluate_permission("execute_build", role, override=None)
        assert decision.allowed, role
        assert decision.policy == "matrix_allow"
    for role in ("reviewer", "viewer"):
        decision = evaluate_permission("execute_build", role, override=None)
        assert not decision.allowed, role
        assert decision.policy == "matrix_deny"


def test_publish_production_configurable_defaults_to_allow_when_unset():
    for role in ("admin", "developer"):
        decision = evaluate_permission("publish_production", role, override=None)
        assert decision.allowed
        assert decision.policy == "default_allow_unconfigured"


def test_publish_production_override_wins_over_default():
    allowed = evaluate_permission("publish_production", "developer", override=True)
    assert allowed.allowed and allowed.policy == "override_allow"
    denied = evaluate_permission("publish_production", "developer", override=False)
    assert not denied.allowed and denied.policy == "override_deny"


def test_publish_production_owner_always_allowed_reviewer_viewer_always_denied():
    assert evaluate_permission("publish_production", "owner", override=None).allowed
    for role in ("reviewer", "viewer"):
        decision = evaluate_permission("publish_production", role, override=None)
        assert not decision.allowed
        assert decision.policy == "matrix_deny"


def test_unknown_action_or_role_denies_rather_than_guessing():
    decision = evaluate_permission("delete_production_database", "owner", override=None)
    assert not decision.allowed
    assert decision.policy == "unknown_action_or_role"


# --------------------------------------------------------------- WorkspacePermissionRepository

def test_override_roundtrip_and_default_none(client):
    from app.core.config import get_settings

    repo = WorkspacePermissionRepository(get_settings().sqlite_path)
    assert repo.get("ws-1", "publish_production", "developer") is None
    repo.set("ws-1", "publish_production", "developer", False, updated_by_user_id="owner-1")
    assert repo.get("ws-1", "publish_production", "developer") is False
    repo.set("ws-1", "publish_production", "developer", True, updated_by_user_id="owner-1")
    assert repo.get("ws-1", "publish_production", "developer") is True
    rows = repo.list_for_workspace("ws-1")
    assert len(rows) == 1 and rows[0]["allowed"] is True


# --------------------------------------------------------------- require_permission + audit trail

def test_require_permission_audits_both_allow_and_deny(client):
    user_id = client.get("/api/auth/me").json()["user_id"]
    workspace_id = _create_shared_workspace(client)

    require_permission("execute_build", workspace_id, user_id)  # owner -> allowed
    with pytest.raises(PermissionDeniedError):
        _member_role(client, workspace_id, "a-stranger-not-a-member")

    events = client.get(
        "/api/activity-feed", params={"category": "authorization", "workspace_id": workspace_id}
    ).json()["items"]
    assert any(e["action"] == "execute_build" and e["status"] == "allowed" for e in events)


def test_require_permission_denies_and_audits_a_role_with_no_membership(client):
    with pytest.raises(PermissionDeniedError):
        require_permission("execute_build", "ws-does-not-exist", "nobody")


# --------------------------------------------------------------- helpers shared by the route tests

def _register(client, label: str) -> tuple[str, str]:
    email_label = label.lower().replace(" ", "-")
    response = client.post(
        "/api/auth/register",
        json={
            "email": f"{email_label}_{uuid4().hex}@example.com",
            "password": "TestPassword123!",
            "full_name": label,
            "privacy_policy_accepted": True,
        },
    )
    assert response.status_code == 201
    token = response.json()["tokens"]["access_token"]
    user_id = str(decode_token(token, expected_type="access")["sub"])
    return token, user_id


def _create_shared_workspace(client) -> str:
    organization = client.post("/api/organizations", json={"name": f"Acme {uuid4().hex[:8]}"})
    assert organization.status_code == 201
    workspace = client.post(
        f"/api/organizations/{organization.json()['organization_id']}/workspaces",
        json={"name": "Shared"},
    )
    assert workspace.status_code == 201
    return workspace.json()["workspace_id"]


def _member_role(client, workspace_id: str, user_id: str) -> None:
    require_permission("execute_build", workspace_id, user_id)


def _add_member(client, workspace_id: str, user_id: str, role: str) -> None:
    response = client.put(f"/api/workspaces/{workspace_id}/members/{user_id}", json={"role": role})
    assert response.status_code == 200, response.text


def _spec():
    from app.schemas.orchestrator import ProjectSpec

    return ProjectSpec(
        raw_intent="Sistema de pedidos",
        product_summary="Operacao de pedidos",
        entities=["Order"],
        business_rules=["Regra"],
        core_workflows=["Fluxo"],
    )


# --------------------------------------------------------------- POST /meta-factory/jobs (execute_build)

def test_reviewer_cannot_create_a_generation_job_in_a_shared_workspace(client):
    workspace_id = _create_shared_workspace(client)
    reviewer_token, reviewer_id = _register(client, "Reviewer Teammate")
    _add_member(client, workspace_id, reviewer_id, "reviewer")

    response = client.post(
        "/api/meta-factory/jobs",
        headers={"Authorization": f"Bearer {reviewer_token}"},
        json={
            "projectId": "room-reviewer", "workspaceId": workspace_id, "projectName": "Reviewer Job",
            "spec": _spec().model_dump(mode="json"), "blueprint": {"decisions": []},
            "blueprintVersion": 1, "mode": "deterministic",
        },
    )
    assert response.status_code == 404


def test_developer_can_create_a_generation_job_in_a_shared_workspace(client, client_scoped_engine, monkeypatch):
    # GenerationJobRepository.create() has its own defense-in-depth membership
    # check against whatever DB its (otherwise module-level-singleton) engine is
    # bound to -- client_scoped_engine rebinds it to this test's DB, same fixture
    # test_generation_job_pipeline.py's route-level tests already rely on.
    from app.routes import meta_factory as route

    monkeypatch.setattr(route, "generation_job_engine", client_scoped_engine)
    monkeypatch.setattr(client_scoped_engine, "start", lambda *args, **kwargs: None)

    workspace_id = _create_shared_workspace(client)
    dev_token, dev_id = _register(client, "Developer Teammate")
    _add_member(client, workspace_id, dev_id, "developer")

    response = client.post(
        "/api/meta-factory/jobs",
        headers={"Authorization": f"Bearer {dev_token}"},
        json={
            "projectId": "room-dev", "workspaceId": workspace_id, "projectName": "Dev Job",
            "spec": _spec().model_dump(mode="json"), "blueprint": {"decisions": []},
            "blueprintVersion": 1, "mode": "deterministic",
        },
    )
    assert response.status_code == 202


# --------------------------------------------------------------- POST /git/export/{provider} (publish_production)

@pytest.fixture
def stub_project(monkeypatch):
    """git_export.py's project lookup is a different (SQL-backed, wizard-era)
    Project entity than the file-based generated-project store -- stubbing the
    lookup isolates the RBAC wiring under test from that unrelated machinery."""
    from app.routes import git_export as route

    state = {"workspace_id": None}

    def _get_project(project_id, user_id):
        return {"project_id": project_id, "workspace_id": state["workspace_id"]}

    monkeypatch.setattr(route.project_service, "get_project", _get_project)

    def _export(user_id, project, request, provider):
        return {
            "contractVersion": "1.0.0", "export_id": "exp_1", "provider": provider,
            "repo_name": request["repo_name"], "namespace": request["namespace"],
            "visibility": request.get("visibility", "private"), "branch": request.get("branch", "main"),
            "commit_message": request.get("commit_message", "Initial commit generated by LDCN OS"),
            "project_id": project["project_id"], "status": "success",
            "security_validation": {
                "contractVersion": "1.0.0", "status": "safe", "message": "ok", "blocked_count": 0,
            },
            "requested_at": "2026-07-20T00:00:00+00:00",
        }

    monkeypatch.setattr(route.engine, "export", _export)

    def _set(workspace_id: str) -> None:
        state["workspace_id"] = workspace_id

    return _set


_EXPORT_PAYLOAD = {
    "provider": "github", "repo_name": "acme-app", "namespace": "acme",
    "project_id": "proj-1", "temporary_token": "tok",
}


def test_viewer_cannot_publish_a_teammates_project_to_git(client, stub_project):
    workspace_id = _create_shared_workspace(client)
    stub_project(workspace_id)
    viewer_token, viewer_id = _register(client, "Viewer Teammate")
    _add_member(client, workspace_id, viewer_id, "viewer")

    response = client.post(
        "/api/git/export/github",
        headers={"Authorization": f"Bearer {viewer_token}"},
        json=_EXPORT_PAYLOAD,
    )
    assert response.status_code == 403


def test_developer_can_publish_a_teammates_project_to_git_by_default(client, stub_project):
    workspace_id = _create_shared_workspace(client)
    stub_project(workspace_id)
    dev_token, dev_id = _register(client, "Publisher Developer")
    _add_member(client, workspace_id, dev_id, "developer")

    response = client.post(
        "/api/git/export/github",
        headers={"Authorization": f"Bearer {dev_token}"},
        json=_EXPORT_PAYLOAD,
    )
    assert response.status_code == 200


def test_owner_can_restrict_developer_publish_via_override_then_developer_is_denied(client, stub_project):
    owner_user_id = client.get("/api/auth/me").json()["user_id"]
    workspace_id = _create_shared_workspace(client)
    stub_project(workspace_id)
    dev_token, dev_id = _register(client, "Restricted Developer")
    _add_member(client, workspace_id, dev_id, "developer")

    override = client.put(
        f"/api/workspaces/{workspace_id}/permission-overrides",
        json={"action": "publish_production", "role": "developer", "allowed": False},
    )
    assert override.status_code == 200

    response = client.post(
        "/api/git/export/github",
        headers={"Authorization": f"Bearer {dev_token}"},
        json=_EXPORT_PAYLOAD,
    )
    assert response.status_code == 403


def test_no_workspace_project_is_never_gated(client, stub_project):
    stub_project(None)
    response = client.post("/api/git/export/github", json=_EXPORT_PAYLOAD)
    assert response.status_code == 200


# --------------------------------------------------------------- permission-overrides management

def test_non_admin_cannot_list_or_set_overrides(client):
    workspace_id = _create_shared_workspace(client)
    dev_token, dev_id = _register(client, "Non Admin")
    _add_member(client, workspace_id, dev_id, "developer")

    listed = client.get(
        f"/api/workspaces/{workspace_id}/permission-overrides",
        headers={"Authorization": f"Bearer {dev_token}"},
    )
    assert listed.status_code == 404

    set_response = client.put(
        f"/api/workspaces/{workspace_id}/permission-overrides",
        headers={"Authorization": f"Bearer {dev_token}"},
        json={"action": "publish_production", "role": "developer", "allowed": False},
    )
    assert set_response.status_code == 404


def test_cannot_override_a_fixed_matrix_cell(client):
    workspace_id = _create_shared_workspace(client)
    response = client.put(
        f"/api/workspaces/{workspace_id}/permission-overrides",
        json={"action": "execute_build", "role": "reviewer", "allowed": True},
    )
    assert response.status_code == 422


# --------------------------------------------------------------- explain endpoint

def test_explain_reports_the_callers_own_effective_permission(client):
    workspace_id = _create_shared_workspace(client)
    response = client.get(
        "/api/permissions/explain", params={"workspace_id": workspace_id, "action": "execute_build"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "owner"
    assert body["allowed"] is True
    assert body["policy"] == "matrix_allow"


def test_explain_404s_for_a_workspace_the_caller_is_not_in(client):
    _, stranger_id = _register(client, "Explain Stranger")
    workspace_id = _create_shared_workspace(client)
    stranger_token, _ = _register(client, "Explain Stranger 2")
    response = client.get(
        "/api/permissions/explain",
        headers={"Authorization": f"Bearer {stranger_token}"},
        params={"workspace_id": workspace_id, "action": "execute_build"},
    )
    assert response.status_code == 404
