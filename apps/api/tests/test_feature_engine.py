from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from app.services.feature_service import FeatureTransitionError, allowed_next_statuses, feature_service
from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter


@pytest.fixture
def make_project():
    created: list[Path] = []
    writer = ProjectWriter()

    def _make(name: str = "feature-test", owner: str | None = None) -> dict:
        result = writer.write([EmittedFile(path="README.md", content="# x")], project_name=name, owner=owner)
        created.append(Path(result.root_path))
        return {"project_id": result.project_id, "generated_project_path": result.root_path}

    yield _make
    for root in created:
        shutil.rmtree(root, ignore_errors=True)


# --------------------------------------------------------------- lifecycle rules

def test_allowed_next_statuses_is_forward_only_plus_deprecated():
    assert allowed_next_statuses("Proposed") == ["Planned", "Deprecated"]
    assert allowed_next_statuses("Planned") == ["In Progress", "Deprecated"]
    assert allowed_next_statuses("Accepted") == ["Released", "Deprecated"]


def test_terminal_statuses_have_no_further_transitions():
    assert allowed_next_statuses("Released") == []
    assert allowed_next_statuses("Deprecated") == []


def test_cannot_skip_ahead_in_the_sequence(client):
    feature = feature_service.create(owner_user_id="user-1", project_id="proj-1", title="Checkout PIX")
    with pytest.raises(FeatureTransitionError) as excinfo:
        feature_service.transition(feature["id"], "user-1", "In Review")
    assert excinfo.value.current_status == "Proposed"
    assert excinfo.value.allowed == ["Planned", "Deprecated"]


def test_cannot_transition_out_of_a_terminal_state(client):
    feature = feature_service.create(owner_user_id="user-1", project_id="proj-1", title="Checkout PIX")
    feature_service.transition(feature["id"], "user-1", "Deprecated")
    with pytest.raises(FeatureTransitionError):
        feature_service.transition(feature["id"], "user-1", "Planned")


def test_can_deprecate_from_any_non_terminal_state(client):
    feature = feature_service.create(owner_user_id="user-1", project_id="proj-1", title="Checkout PIX")
    feature_service.transition(feature["id"], "user-1", "Planned")
    result = feature_service.transition(feature["id"], "user-1", "Deprecated")
    assert result["status"] == "Deprecated"


def test_full_forward_sequence_reaches_released(client):
    feature = feature_service.create(owner_user_id="user-1", project_id="proj-1", title="Checkout PIX")
    for status in ("Planned", "In Progress", "In Review", "Accepted", "Released"):
        feature = feature_service.transition(feature["id"], "user-1", status)
    assert feature["status"] == "Released"


# --------------------------------------------------------------- CRUD + ownership

def test_create_and_get_roundtrip_preserves_list_fields(client):
    feature = feature_service.create(
        owner_user_id="user-1", project_id="proj-1", title="Checkout PIX",
        problem="Sem meio de pagamento local", objective="Aumentar conversão",
        target_users=["compradores BR"], scope=["checkout", "webhook"], acceptance_criteria=["PIX aparece no checkout"],
        priority="high",
    )
    fetched = feature_service.get(feature["id"], "user-1")
    assert fetched["title"] == "Checkout PIX"
    assert fetched["target_users"] == ["compradores BR"]
    assert fetched["scope"] == ["checkout", "webhook"]
    assert fetched["priority"] == "high"
    assert fetched["status"] == "Proposed"


def test_get_is_owner_scoped(client):
    feature = feature_service.create(owner_user_id="user-a", project_id="proj-1", title="X")
    assert feature_service.get(feature["id"], "user-b") is None


def test_list_for_project_is_owner_scoped(client):
    feature_service.create(owner_user_id="user-a", project_id="proj-shared", title="A")
    feature_service.create(owner_user_id="user-b", project_id="proj-shared", title="B")
    assert len(feature_service.list_for_project("proj-shared", "user-a")) == 1
    assert len(feature_service.list_for_project("proj-shared", "user-b")) == 1


def test_delete_is_owner_scoped(client):
    feature = feature_service.create(owner_user_id="user-a", project_id="proj-1", title="X")
    assert feature_service.delete(feature["id"], "user-b") is False
    assert feature_service.delete(feature["id"], "user-a") is True
    assert feature_service.get(feature["id"], "user-a") is None


# --------------------------------------------------------------- routes

def test_route_create_list_get_delete(client, make_project):
    owner = client.get("/api/auth/me").json()["user_id"]
    project = make_project(owner=owner)

    created = client.post("/api/features", json={"project_id": project["project_id"], "title": "Checkout PIX"})
    assert created.status_code == 201
    feature_id = created.json()["id"]

    listed = client.get("/api/features", params={"project_id": project["project_id"]})
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    fetched = client.get(f"/api/features/{feature_id}")
    assert fetched.status_code == 200

    deleted = client.delete(f"/api/features/{feature_id}")
    assert deleted.status_code == 204
    assert client.get(f"/api/features/{feature_id}").status_code == 404


def test_route_transition_conflict_reports_allowed_statuses(client, make_project):
    owner = client.get("/api/auth/me").json()["user_id"]
    project = make_project(owner=owner)
    created = client.post("/api/features", json={"project_id": project["project_id"], "title": "X"})
    feature_id = created.json()["id"]

    response = client.post(f"/api/features/{feature_id}/transition", json={"status": "Released"})
    assert response.status_code == 409
    assert response.json()["detail"]["allowed"] == ["Planned", "Deprecated"]


# --------------------------------------------------------------- ChangeRequest.feature_id validation

def test_change_request_with_a_real_feature_in_the_same_project_succeeds(client, make_project):
    owner = client.get("/api/auth/me").json()["user_id"]
    project = make_project(owner=owner)
    feature = feature_service.create(owner_user_id=owner, project_id=project["project_id"], title="X")

    response = client.post("/api/change-requests", json={"project_id": project["project_id"], "intent": "ajustar checkout", "feature_id": feature["id"]})
    assert response.status_code == 201
    assert response.json()["feature_id"] == feature["id"]


def test_change_request_with_a_feature_from_a_different_project_is_rejected(client, make_project):
    owner = client.get("/api/auth/me").json()["user_id"]
    project = make_project(owner=owner, name="cr-proj-1")
    other_project = make_project(owner=owner, name="cr-proj-2")
    feature = feature_service.create(owner_user_id=owner, project_id=other_project["project_id"], title="X")

    response = client.post("/api/change-requests", json={"project_id": project["project_id"], "intent": "ajustar checkout", "feature_id": feature["id"]})
    assert response.status_code == 404


def test_change_request_with_an_unknown_feature_id_is_rejected(client, make_project):
    owner = client.get("/api/auth/me").json()["user_id"]
    project = make_project(owner=owner)

    response = client.post("/api/change-requests", json={"project_id": project["project_id"], "intent": "ajustar checkout", "feature_id": "feat_does_not_exist"})
    assert response.status_code == 404


def test_change_request_without_a_feature_id_still_works_as_maintenance(client, make_project):
    owner = client.get("/api/auth/me").json()["user_id"]
    project = make_project(owner=owner)

    response = client.post("/api/change-requests", json={"project_id": project["project_id"], "intent": "corrigir bug"})
    assert response.status_code == 201
    assert response.json()["feature_id"] is None
