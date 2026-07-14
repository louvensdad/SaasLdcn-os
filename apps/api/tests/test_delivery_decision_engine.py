from __future__ import annotations

import shutil
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.engines import delivery_decision_engine
from app.engines.delivery_decision_engine import compute_delivery_decision
from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter

# Same real-files-on-disk pattern as test_engineering_kernel_engine.py -- no
# filesystem mocking, and git_provider_service.status is the only external
# signal, stubbed per-test like every other network-touching signal in this
# codebase's test suite.


@pytest.fixture
def make_project():
    created: list[Path] = []
    writer = ProjectWriter()

    def _make(files: list[tuple[str, str]] | None = None, name: str = "delivery-test") -> dict:
        files = files or [("README.md", "# test\n")]
        result = writer.write(
            [EmittedFile(path=path, content=content) for path, content in files], project_name=name,
        )
        created.append(Path(result.root_path))
        return {"project_id": result.project_id, "generated_project_path": result.root_path}

    yield _make
    for root in created:
        shutil.rmtree(root, ignore_errors=True)


@pytest.fixture(autouse=True)
def _no_git_connection(monkeypatch):
    # Default: no provider connected, matching a fresh account -- individual
    # tests override this to exercise the "already connected" recommendation.
    monkeypatch.setattr(
        delivery_decision_engine.git_provider_service, "status",
        lambda *a, **k: {"status": "disconnected"},
    )


def test_bare_project_is_blocked_with_no_delivery_choice_forced(make_project):
    # A bare project (just a README) has real Quality Gate BLOCKERs -- the
    # decision center must say so honestly rather than presenting all 4
    # options as if nothing is wrong.
    project = make_project()
    decision = compute_delivery_decision(project["project_id"], "owner-1")
    assert decision.blocked is True
    assert decision.block_reason
    assert len(decision.options) == 4


def test_verified_project_defaults_to_zip_recommended_when_no_git_connection(make_project):
    project = make_project()
    ProjectWriter().set_verification(project["project_id"], verified=True, score=100)
    decision = compute_delivery_decision(project["project_id"], "owner-1")
    assert decision.blocked is False
    recommended = next(o for o in decision.options if o.recommended)
    assert recommended.mode == "zip_only"


def test_recommendation_flips_to_git_export_when_a_provider_is_already_connected(make_project, monkeypatch):
    monkeypatch.setattr(
        delivery_decision_engine.git_provider_service, "status",
        lambda user_id, provider: {"status": "connected"} if provider == "github" else {"status": "disconnected"},
    )
    project = make_project()
    ProjectWriter().set_verification(project["project_id"], verified=True, score=100)
    decision = compute_delivery_decision(project["project_id"], "owner-1")
    recommended = next(o for o in decision.options if o.recommended)
    assert recommended.mode == "git_export"
    assert "github" in recommended.reason.lower()


def test_no_profile_recorded_yet_is_none(make_project):
    project = make_project()
    decision = compute_delivery_decision(project["project_id"], "owner-1")
    assert decision.current_profile is None


def test_recorded_profile_round_trips(make_project):
    project = make_project()
    ProjectWriter().set_delivery_profile(project["project_id"], delivery_mode="ldcn_only", by_user="owner-1")
    decision = compute_delivery_decision(project["project_id"], "owner-1")
    assert decision.current_profile is not None
    assert decision.current_profile.delivery_mode == "ldcn_only"
    assert decision.current_profile.chosen_by == "owner-1"


def _register_second_user(client: TestClient) -> str:
    response = client.post(
        "/api/auth/register",
        json={
            "email": f"other_{uuid4().hex}@example.com",
            "password": "OtherPassword123!",
            "full_name": "Other User",
            "privacy_policy_accepted": True,
        },
    )
    assert response.status_code in (200, 201), response.text
    return response.json()["tokens"]["access_token"]


def test_delivery_route_returns_the_computed_decision(client: TestClient) -> None:
    me = client.get("/api/auth/me")
    owner_id = me.json()["user_id"]
    result = ProjectWriter().write(
        [EmittedFile(path="README.md", content="# test\n")], project_name="delivery-route-test", owner=owner_id,
    )
    try:
        ProjectWriter().set_verification(result.project_id, verified=True, score=100)
        response = client.get(f"/api/meta-factory/{result.project_id}/delivery")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["blocked"] is False
        assert len(body["options"]) == 4
        assert body["current_profile"] is None
    finally:
        shutil.rmtree(result.root_path, ignore_errors=True)


def test_recording_a_delivery_decision_persists_across_requests(client: TestClient) -> None:
    me = client.get("/api/auth/me")
    owner_id = me.json()["user_id"]
    result = ProjectWriter().write(
        [EmittedFile(path="README.md", content="# test\n")], project_name="delivery-record-test", owner=owner_id,
    )
    try:
        record = client.post(
            f"/api/meta-factory/{result.project_id}/delivery", json={"delivery_mode": "zip_and_git"},
        )
        assert record.status_code == 200, record.text
        assert record.json()["current_profile"]["delivery_mode"] == "zip_and_git"

        refetch = client.get(f"/api/meta-factory/{result.project_id}/delivery")
        assert refetch.status_code == 200, refetch.text
        assert refetch.json()["current_profile"]["delivery_mode"] == "zip_and_git"
    finally:
        shutil.rmtree(result.root_path, ignore_errors=True)


def test_recording_a_decision_is_allowed_even_when_blocked(client: TestClient) -> None:
    # Recording a preference is non-destructive -- it must never require passing
    # the same release gate that _require_verified() enforces for the real
    # ZIP/git export actions.
    me = client.get("/api/auth/me")
    owner_id = me.json()["user_id"]
    result = ProjectWriter().write(
        [EmittedFile(path="README.md", content="# test\n")], project_name="delivery-blocked-test", owner=owner_id,
    )
    try:
        record = client.post(
            f"/api/meta-factory/{result.project_id}/delivery", json={"delivery_mode": "ldcn_only"},
        )
        assert record.status_code == 200, record.text
        assert record.json()["blocked"] is True
    finally:
        shutil.rmtree(result.root_path, ignore_errors=True)


def test_delivery_route_is_owner_scoped(client: TestClient) -> None:
    me = client.get("/api/auth/me")
    owner_id = me.json()["user_id"]
    result = ProjectWriter().write(
        [EmittedFile(path="README.md", content="# test\n")], project_name="delivery-owner-test", owner=owner_id,
    )
    try:
        other_token = _register_second_user(client)
        response = client.get(
            f"/api/meta-factory/{result.project_id}/delivery",
            headers={"Authorization": f"Bearer {other_token}"},
        )
        assert response.status_code == 404
    finally:
        shutil.rmtree(result.root_path, ignore_errors=True)
