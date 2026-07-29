from __future__ import annotations

import shutil
from pathlib import Path
from uuid import uuid4

import pytest

from app.core.security import decode_token
from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter

CONFIRMATION = "LIBERAR COM RISCO"


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


@pytest.fixture
def owned_workspace_project():
    """A generated project on disk, owned by the calling `client`'s user, tagged
    with a real workspace_id -- used to test the force-release workspace-role
    fallback (the plain `make_project` fixture in test_quality_gate_auto_repair.py
    doesn't set owner/workspace_id, so it can't exercise this path)."""
    created: list[Path] = []
    writer = ProjectWriter()

    def _make(*, owner: str, workspace_id: str) -> str:
        result = writer.write(
            [EmittedFile(path="README.md", content="# Project")],
            project_name="force-release-rbac",
            owner=owner,
            workspace_id=workspace_id,
        )
        created.append(Path(result.root_path))
        return result.project_id

    yield _make
    for root in created:
        shutil.rmtree(root, ignore_errors=True)


def _create_shared_workspace(client) -> str:
    organization = client.post("/api/organizations", json={"name": f"Acme {uuid4().hex[:8]}"})
    assert organization.status_code == 201
    workspace = client.post(
        f"/api/organizations/{organization.json()['organization_id']}/workspaces",
        json={"name": "Shared"},
    )
    assert workspace.status_code == 201
    return workspace.json()["workspace_id"]


def test_non_owner_non_member_gets_404(client, owned_workspace_project):
    owner_user_id = client.get("/api/auth/me").json()["user_id"]
    workspace_id = _create_shared_workspace(client)
    project_id = owned_workspace_project(owner=owner_user_id, workspace_id=workspace_id)

    stranger_token, _ = _register(client, "Stranger")
    response = client.post(
        f"/api/meta-factory/{project_id}/force-release",
        headers={"Authorization": f"Bearer {stranger_token}"},
        json={"confirmation": CONFIRMATION},
    )

    assert response.status_code == 404


def test_workspace_member_can_force_release_a_teammates_project(client, owned_workspace_project):
    owner_user_id = client.get("/api/auth/me").json()["user_id"]
    workspace_id = _create_shared_workspace(client)
    project_id = owned_workspace_project(owner=owner_user_id, workspace_id=workspace_id)

    member_token, member_user_id = _register(client, "Teammate Member")
    client.put(f"/api/workspaces/{workspace_id}/members/{member_user_id}", json={"role": "member"})

    response = client.post(
        f"/api/meta-factory/{project_id}/force-release",
        headers={"Authorization": f"Bearer {member_token}"},
        json={"confirmation": CONFIRMATION},
    )

    assert response.status_code == 200


def test_workspace_viewer_cannot_force_release_a_teammates_project(client, owned_workspace_project):
    owner_user_id = client.get("/api/auth/me").json()["user_id"]
    workspace_id = _create_shared_workspace(client)
    project_id = owned_workspace_project(owner=owner_user_id, workspace_id=workspace_id)

    viewer_token, viewer_user_id = _register(client, "Teammate Viewer")
    client.put(f"/api/workspaces/{workspace_id}/members/{viewer_user_id}", json={"role": "viewer"})

    response = client.post(
        f"/api/meta-factory/{project_id}/force-release",
        headers={"Authorization": f"Bearer {viewer_token}"},
        json={"confirmation": CONFIRMATION},
    )

    assert response.status_code == 404


def test_owner_can_still_force_release_their_own_project(client, owned_workspace_project):
    owner_user_id = client.get("/api/auth/me").json()["user_id"]
    workspace_id = _create_shared_workspace(client)
    project_id = owned_workspace_project(owner=owner_user_id, workspace_id=workspace_id)

    response = client.post(
        f"/api/meta-factory/{project_id}/force-release",
        json={"confirmation": CONFIRMATION},
    )

    assert response.status_code == 200
