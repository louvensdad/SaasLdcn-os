from __future__ import annotations

from uuid import uuid4

from app.core.security import decode_token


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


def test_registration_provisions_personal_tenant(client):
    organizations = client.get("/api/organizations")
    workspaces = client.get("/api/workspaces")
    default_workspace = client.get("/api/workspaces/default")

    assert organizations.status_code == workspaces.status_code == default_workspace.status_code == 200
    assert len(organizations.json()) == 1
    assert organizations.json()[0]["role"] == "owner"
    assert len(workspaces.json()) == 1
    assert workspaces.json()[0]["is_personal"] is True
    assert default_workspace.json()["workspace_id"] == workspaces.json()[0]["workspace_id"]


def test_workspace_membership_rbac_and_project_room_isolation(client):
    organization = client.post(
        "/api/organizations",
        json={"name": f"Acme {uuid4().hex[:8]}"},
    )
    assert organization.status_code == 201
    workspace = client.post(
        f"/api/organizations/{organization.json()['organization_id']}/workspaces",
        json={"name": "Platform"},
    )
    assert workspace.status_code == 201
    workspace_id = workspace.json()["workspace_id"]

    second_token, second_user_id = _register(client, "Second User")
    added = client.put(
        f"/api/workspaces/{workspace_id}/members/{second_user_id}",
        json={"role": "viewer"},
    )
    assert added.status_code == 200

    second_headers = {"Authorization": f"Bearer {second_token}"}
    assert client.get(f"/api/workspaces/{workspace_id}", headers=second_headers).status_code == 200
    blocked_room = client.post(
        "/api/project-rooms",
        headers=second_headers,
        json={"title": "Blocked", "workspace_id": workspace_id},
    )
    assert blocked_room.status_code == 404

    promoted = client.put(
        f"/api/workspaces/{workspace_id}/members/{second_user_id}",
        json={"role": "member"},
    )
    assert promoted.status_code == 200
    room = client.post(
        "/api/project-rooms",
        headers=second_headers,
        json={"title": "Shared", "workspace_id": workspace_id},
    )
    assert room.status_code == 201
    assert room.json()["workspace_id"] == workspace_id

    cannot_admin = client.put(
        f"/api/workspaces/{workspace_id}/members/{second_user_id}",
        headers=second_headers,
        json={"role": "admin"},
    )
    assert cannot_admin.status_code == 404


def test_arbitrary_workspace_id_is_rejected(client, monkeypatch):
    from app.routes import meta_factory as route

    monkeypatch.setattr(route.generation_job_engine, "start", lambda *args, **kwargs: None)
    response = client.post(
        "/api/meta-factory/jobs",
        json={
            "projectId": "room-forged",
            "workspaceId": "ws_foreign",
            "projectName": "Forged",
            "spec": {
                "raw_intent": "test",
                "product_summary": "test",
                "entities": [],
                "business_rules": [],
                "core_workflows": [],
            },
            "blueprint": {"decisions": []},
            "mode": "deterministic",
        },
    )

    assert response.status_code == 404
