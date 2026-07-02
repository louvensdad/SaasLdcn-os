from __future__ import annotations

from uuid import uuid4

from app.core.config import get_settings
from app.core.security import decode_token

def _build_blueprint(client, *, valid: bool = True):
    payload = {
        "project_name": "ldcn-registry-app" if valid else "ldcn-blocked-app",
        "language_id": "typescript",
        "runtime_id": "nodejs",
        "framework_id": "nestjs",
        "architecture_id": "modular_monolith",
        "archetype_id": "ai_saas",
        "capability_ids": ["authentication", "rbac", "ai_chat", "analytics", "rate_limiting", "observability"] if valid else ["authentication"],
        "business_module_ids": ["users", "reports", "subscriptions", "notifications"] if valid else ["users"],
        "endpoint_ids": ["auth.login", "auth.register", "auth.me", "analytics.overview", "ai.chat"] if valid else ["auth.login", "ai.chat"],
        "locale": "pt-BR",
        "generation_mode": "local_build_90",
        "project_requirements": {
            "project_goal": "Deliver a governed registry application.",
            "business_context": "Commercial SaaS operation.",
            "target_users": ["operators", "customers"],
            "business_rules": ["Authorized users manage records."],
            "entities": ["User", "Subscription"],
            "workflows": ["Customer request is reviewed by an operator."],
            "constraints": ["Protect personal data."],
            "delivery_target": "github",
        },
    }
    response = client.post("/api/blueprints/preview", json=payload)
    assert response.status_code == 200
    return response.json()


def _build_prompt_master(client, blueprint: dict):
    response = client.post("/api/prompt-master/preview", json={"blueprint": blueprint})
    assert response.status_code == 200
    return response.json()


def _build_gatekeeper(client, blueprint: dict, prompt_master: dict):
    response = client.post(
        "/api/gatekeeper/preview",
        json={"blueprint": blueprint, "prompt_master": prompt_master},
    )
    assert response.status_code == 200
    return response.json()


def test_save_approved_project(client):
    blueprint = _build_blueprint(client)
    prompt_master = _build_prompt_master(client, blueprint)
    gatekeeper = _build_gatekeeper(client, blueprint, prompt_master)

    response = client.post(
        "/api/projects/save-from-wizard",
        json={"blueprint": blueprint, "prompt_master": prompt_master, "gatekeeper": gatekeeper},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["status"] == "ready_for_generation"
    assert payload["readiness_status"] == "ready"
    assert payload["project_name"] == blueprint["project_name"]
    assert payload["architectural_graph_snapshot"]["graph"]["nodes"]
    assert payload["architectural_graph_snapshot"]["source"] == "preview"


def test_save_blocked_project(client):
    blueprint = _build_blueprint(client, valid=False)
    prompt_master = _build_prompt_master(client, blueprint)
    gatekeeper = _build_gatekeeper(client, blueprint, prompt_master)

    response = client.post(
        "/api/projects/save-from-wizard",
        json={"blueprint": blueprint, "prompt_master": prompt_master, "gatekeeper": gatekeeper},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["status"] == "generation_blocked"
    assert payload["readiness_status"] == "blocked"


def test_get_project_by_id(client):
    blueprint = _build_blueprint(client)
    prompt_master = _build_prompt_master(client, blueprint)
    gatekeeper = _build_gatekeeper(client, blueprint, prompt_master)
    created = client.post(
        "/api/projects/save-from-wizard",
        json={"blueprint": blueprint, "prompt_master": prompt_master, "gatekeeper": gatekeeper},
    ).json()

    response = client.get(f"/api/projects/{created['project_id']}")

    assert response.status_code == 200
    assert response.json()["project_id"] == created["project_id"]
    assert response.json()["architectural_graph_snapshot"]["graph"]["architecture_id"] == blueprint["architecture_profile"]["architecture_id"]


def test_patch_project(client):
    blueprint = _build_blueprint(client)
    prompt_master = _build_prompt_master(client, blueprint)
    gatekeeper = _build_gatekeeper(client, blueprint, prompt_master)
    created = client.post(
        "/api/projects/save-from-wizard",
        json={"blueprint": blueprint, "prompt_master": prompt_master, "gatekeeper": gatekeeper},
    ).json()

    response = client.patch(
        f"/api/projects/{created['project_id']}",
        json={"project_name": "ldcn-registry-renamed", "status": "generated", "readiness_status": "generated"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["project_name"] == "ldcn-registry-renamed"
    assert payload["status"] == "generated"
    assert payload["readiness_status"] == "generated"


def test_delete_project(client):
    blueprint = _build_blueprint(client)
    prompt_master = _build_prompt_master(client, blueprint)
    gatekeeper = _build_gatekeeper(client, blueprint, prompt_master)
    created = client.post(
        "/api/projects/save-from-wizard",
        json={"blueprint": blueprint, "prompt_master": prompt_master, "gatekeeper": gatekeeper},
    ).json()

    delete_response = client.delete(f"/api/projects/{created['project_id']}")
    get_response = client.get(f"/api/projects/{created['project_id']}")

    assert delete_response.status_code == 204
    assert get_response.status_code == 404


def test_save_from_wizard_invalid_payload_returns_422(client):
    response = client.post("/api/projects/save-from-wizard", json={"blueprint": {}})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_saved_snapshots_do_not_contain_secrets(client):
    blueprint = _build_blueprint(client)
    prompt_master = _build_prompt_master(client, blueprint)
    gatekeeper = _build_gatekeeper(client, blueprint, prompt_master)
    created = client.post(
        "/api/projects/save-from-wizard",
        json={"blueprint": blueprint, "prompt_master": prompt_master, "gatekeeper": gatekeeper},
    ).json()

    serialized = str(
        {
            "blueprint": created["blueprint_snapshot"],
            "prompt_master": created["prompt_master_snapshot"],
            "gatekeeper": created["gatekeeper_snapshot"],
        }
    ).lower()
    assert "password=" not in serialized
    assert "token=" not in serialized
    assert "secret=" not in serialized


def _save_project(client):
    blueprint = _build_blueprint(client)
    prompt_master = _build_prompt_master(client, blueprint)
    gatekeeper = _build_gatekeeper(client, blueprint, prompt_master)
    return client.post(
        "/api/projects/save-from-wizard",
        json={"blueprint": blueprint, "prompt_master": prompt_master, "gatekeeper": gatekeeper},
    ).json()


def test_projects_list_pagination_is_backward_compatible(client):
    for _ in range(3):
        _save_project(client)

    full = client.get("/api/projects")
    assert full.status_code == 200
    total = len(full.json())
    assert total >= 1
    # Total is always exposed for pagers, and the no-param call still returns a plain array.
    assert full.headers.get("X-Total-Count") == str(total)
    assert isinstance(full.json(), list)

    limited = client.get("/api/projects", params={"limit": 1})
    assert limited.status_code == 200
    assert isinstance(limited.json(), list) and len(limited.json()) == min(1, total)
    assert limited.headers.get("X-Total-Count") == str(total)

    if total >= 2:
        page2 = client.get("/api/projects", params={"limit": 1, "offset": 1})
        assert len(page2.json()) == 1
        assert page2.json()[0]["project_id"] != limited.json()[0]["project_id"]


def _register_project_collaborator(client) -> tuple[str, str]:
    response = client.post(
        "/api/auth/register",
        json={
            "email": f"project-collaborator-{uuid4().hex}@example.com",
            "password": "TestPassword123!",
            "full_name": "Project Collaborator",
            "privacy_policy_accepted": True,
        },
    )
    token = response.json()["tokens"]["access_token"]
    return token, str(decode_token(token, expected_type="access")["sub"])


def test_projects_are_private_but_workspace_members_can_collaborate(client):
    private = _save_project(client)
    second_token, second_user_id = _register_project_collaborator(client)
    second_headers = {"Authorization": f"Bearer {second_token}"}

    assert client.get(f"/api/projects/{private['project_id']}", headers=second_headers).status_code == 404
    assert private["project_id"] not in {
        item["project_id"] for item in client.get("/api/projects", headers=second_headers).json()
    }

    organization = client.post("/api/organizations", json={"name": f"Project Org {uuid4().hex[:8]}"}).json()
    workspace = client.post(
        f"/api/organizations/{organization['organization_id']}/workspaces",
        json={"name": "Shared Projects"},
    ).json()
    client.put(
        f"/api/workspaces/{workspace['workspace_id']}/members/{second_user_id}",
        json={"role": "viewer"},
    )
    blueprint = _build_blueprint(client)
    prompt_master = _build_prompt_master(client, blueprint)
    gatekeeper = _build_gatekeeper(client, blueprint, prompt_master)
    shared = client.post(
        "/api/projects/save-from-wizard",
        json={
            "workspace_id": workspace["workspace_id"],
            "blueprint": blueprint,
            "prompt_master": prompt_master,
            "gatekeeper": gatekeeper,
        },
    ).json()

    assert client.get(f"/api/projects/{shared['project_id']}", headers=second_headers).status_code == 200
    assert client.patch(
        f"/api/projects/{shared['project_id']}",
        headers=second_headers,
        json={"project_name": "viewer-cannot-write"},
    ).status_code == 404

    client.put(
        f"/api/workspaces/{workspace['workspace_id']}/members/{second_user_id}",
        json={"role": "member"},
    )
    updated = client.patch(
        f"/api/projects/{shared['project_id']}",
        headers=second_headers,
        json={"project_name": "member-can-write"},
    )
    assert updated.status_code == 200
    assert updated.json()["project_name"] == "member-can-write"


def test_global_seed_projects_are_read_only(client):
    from app.routes.projects import service

    seed = _save_project(client)
    with service.project_repository.connection() as connection:
        connection.execute(
            "UPDATE projects SET owner_user_id = NULL, workspace_id = NULL WHERE project_id = ?",
            (seed["project_id"],),
        )

    response = client.patch(
        f"/api/projects/{seed['project_id']}",
        json={"project_name": "must-not-change"},
    )

    assert response.status_code == 404


def test_approve_blueprint_records_a_queryable_approval(client):
    project = _save_project(client)

    response = client.post(
        f"/api/projects/{project['project_id']}/approve-blueprint",
        json={"reason": "Reviewed manually before generation."},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["project_id"] == project["project_id"]
    assert body["reason"] == "Reviewed manually before generation."
    assert body["revoked_at"] is None

    from app.repositories.blueprint_approval_repository import BlueprintApprovalRepository, hash_blueprint

    repo = BlueprintApprovalRepository(get_settings().sqlite_path)
    blueprint_hash = hash_blueprint(project["blueprint_snapshot"])
    assert repo.is_approved(project["project_id"], blueprint_hash)
    latest = repo.latest_for_project(project["project_id"])
    assert latest["approval_id"] == body["approval_id"]


def test_approve_blueprint_hash_is_stable_regardless_of_key_order(client):
    from app.repositories.blueprint_approval_repository import hash_blueprint

    assert hash_blueprint({"a": 1, "b": 2}) == hash_blueprint({"b": 2, "a": 1})
    assert hash_blueprint({"a": 1, "b": 2}) != hash_blueprint({"a": 1, "b": 3})


def test_approve_blueprint_unknown_project_returns_404(client):
    response = client.post(
        "/api/projects/does-not-exist/approve-blueprint",
        json={"reason": "n/a"},
    )
    assert response.status_code == 404
