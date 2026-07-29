from __future__ import annotations

from fastapi.testclient import TestClient
from uuid import uuid4


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


def _create(client: TestClient, mission_type: str = "software.build", title: str = "Missão de teste") -> dict:
    response = client.post("/api/missions", json={"mission_type": mission_type, "title": title})
    assert response.status_code == 201, response.text
    return response.json()


def test_creating_a_mission_starts_active_with_no_answers(client: TestClient):
    mission = _create(client)

    assert mission["status"] == "active"
    assert mission["type"] == "software.build"
    assert mission["context"]["answers"] == {}
    assert mission["artifacts"] == []


def test_autosave_persists_answers_and_journey(client: TestClient):
    mission = _create(client)
    mission_id = mission["id"]

    response = client.patch(
        f"/api/missions/{mission_id}",
        json={
            "context": {"answers": {"vision.project_name": "Acme ERP"}, "decisions": [], "gaps": [], "risks": [], "inconsistencies": []},
            "journey": {"step_ids": ["vision", "users"], "current_step_id": "vision", "progress": 10, "steps": []},
        },
    )

    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved["context"]["answers"]["vision.project_name"] == "Acme ERP"
    assert saved["journey"]["current_step_id"] == "vision"
    assert saved["journey"]["progress"] == 10
    assert saved["version"] == 2  # bumped by the autosave

    reloaded = client.get(f"/api/missions/{mission_id}")
    assert reloaded.json()["context"]["answers"]["vision.project_name"] == "Acme ERP"


def test_field_action_never_fabricates_when_no_llm_is_configured(client: TestClient):
    """AI actions are blocked unless the request opts into a validated user key."""
    mission = _create(client)
    mission_id = mission["id"]

    response = client.post(
        f"/api/missions/{mission_id}/ai-action",
        json={
            "step_id": "vision", "field_id": "vision_description", "action_id": "improve",
            "specialist": "software_architect", "interpolated_prompt": "Improve: 'a system for clinics'",
            "insert_mode": "replace",
        },
    )

    assert response.status_code == 409, response.text
    assert "user API key" in response.json()["error"]["message"]


def test_record_decision_is_persisted(client: TestClient):
    mission = _create(client)
    mission_id = mission["id"]

    response = client.post(
        f"/api/missions/{mission_id}/decisions",
        json={"step_id": "technology", "field_id": "language", "value": "Python", "source": "user"},
    )

    assert response.status_code == 200, response.text
    decisions = response.json()["context"]["decisions"]
    assert len(decisions) == 1
    assert decisions[0]["value"] == "Python"
    assert decisions[0]["step_id"] == "technology"


def test_preview_artifacts_requires_a_validated_user_key(client: TestClient):
    mission = _create(client, mission_type="error.diagnose")
    mission_id = mission["id"]
    client.patch(
        f"/api/missions/{mission_id}",
        json={"context": {"answers": {"observed_error.error_description": "Login fails with a 500."}, "decisions": [], "gaps": [], "risks": [], "inconsistencies": []}},
    )

    response = client.post(
        f"/api/missions/{mission_id}/artifacts/preview",
        json={
            "artifact_definitions": [{"type": "diagnosis", "title": "Relatório de Diagnóstico"}],
            "step_titles": {"observed_error": "Erro observado"},
        },
    )

    assert response.status_code == 409, response.text
    assert "user API key" in response.json()["error"]["message"]


def test_confirm_artifacts_persists_the_reviewed_draft_and_never_calls_an_llm(client: TestClient):
    """Confirm only ever persists content the user already reviewed in the
    preview step -- it must not require (or silently trigger) any LLM call."""
    mission = _create(client)
    mission_id = mission["id"]

    response = client.post(
        f"/api/missions/{mission_id}/artifacts/confirm",
        json={"artifacts": [{"type": "blueprint", "title": "Blueprint", "content": "Conteúdo revisado pelo usuário.", "format": "markdown"}]},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["artifacts"]) == 1
    assert body["artifacts"][0]["content"] == "Conteúdo revisado pelo usuário."
    assert body["artifacts"][0]["title"] == "Blueprint"


def test_delete_mission(client: TestClient):
    mission = _create(client)
    mission_id = mission["id"]

    response = client.delete(f"/api/missions/{mission_id}")
    assert response.status_code == 204

    assert client.get(f"/api/missions/{mission_id}").status_code == 404


def test_foreign_user_cannot_read_another_users_mission(client: TestClient):
    mission = _create(client, mission_type="project.analyze")
    mission_id = mission["id"]
    other_token = _register_second_user(client)

    response = client.get(f"/api/missions/{mission_id}", headers={"Authorization": f"Bearer {other_token}"})

    assert response.status_code == 404
