from __future__ import annotations

import time
from uuid import uuid4

from fastapi.testclient import TestClient

from app.engines.generation_job_engine import generation_job_engine
from app.engines.llm.router import LLMRouter
from app.schemas.llm import LLMResponse, Provider
from app.services.ai_key_vault_service import ai_key_vault_service


def _prevent_real_pipeline_execution(monkeypatch) -> None:
    """start_generation kicks off a real generation_job_engine.start(), which
    schedules a background thread that calls the actual configured LLM
    provider -- these tests only assert on job creation/idempotency (the real
    pipeline execution itself is covered by test_generation_job_pipeline.py),
    so prevent it from ever running rather than letting a background thread
    outlive the test and hit the network with the fake test key."""
    monkeypatch.setattr(generation_job_engine, "start", lambda *args, **kwargs: None)

SOFTWARE_BUILD_ARTIFACT_TYPES = [
    "blueprint", "prompt_md", "architecture", "data_model",
    "api_contracts", "test_plan", "deploy_plan",
]

SOFTWARE_BUILD_ANSWERS = {
    "vision.project_name": "Acme ERP",
    "vision.system_type": "ERP",
    "vision.vision_description": "Sistema de gestao de estoque",
    "vision.problem": "Controle de estoque manual e sujeito a erros",
    "users.user_types": ["Admin", "Operador"],
    "business_rules.main_rules": "Regra 1\nRegra 2",
    "business_rules.operational_flows": "Fluxo de compra",
    "data_model.entities": [{"name": "Produto"}, {"name": "Pedido"}],
    "technology.language": "Python",
    "technology.framework": "FastAPI",
    "architecture.architecture_style": "Monolito",
}


def _create_mission(client: TestClient, mission_type: str = "software.build", title: str = "Missão de teste") -> dict:
    response = client.post("/api/missions", json={"mission_type": mission_type, "title": title})
    assert response.status_code == 201, response.text
    return response.json()


def _validated_key(client: TestClient) -> None:
    """Same pattern test_mission_deliverable_jobs.py/test_project_rooms.py use
    to get past the "validated user key required" gate."""
    client.post("/api/user-ai-keys", json={"provider": "anthropic", "nome": "Minha chave", "api_key": "sk-test-handoff-1234"})
    user_id = client.get("/api/auth/me").json()["user_id"]
    key_row = ai_key_vault_service.get_default_for_provider(user_id, "anthropic")
    ai_key_vault_service.mark_validated(user_id, key_row["id"], status="valid")


def _set_answers(client: TestClient, mission_id: str, answers: dict) -> None:
    response = client.patch(f"/api/missions/{mission_id}", json={"context": {"answers": answers}})
    assert response.status_code == 200, response.text


def _wait_for_status(client: TestClient, mission_id: str, job_id: str, statuses: set[str], timeout: float = 5.0) -> dict:
    deadline = time.monotonic() + timeout
    job: dict | None = None
    while time.monotonic() < deadline:
        response = client.get(f"/api/missions/{mission_id}/deliverables/jobs/{job_id}")
        assert response.status_code == 200, response.text
        job = response.json()
        if job["status"] in statuses:
            return job
        time.sleep(0.05)
    raise AssertionError(f"job did not reach {statuses} within {timeout}s (last status={job['status'] if job else None})")


def _compile_and_confirm_all_deliverables(
    client: TestClient, mission_id: str, monkeypatch, *, artifact_types: list[str] | None = None
) -> str:
    _validated_key(client)
    types = artifact_types if artifact_types is not None else SOFTWARE_BUILD_ARTIFACT_TYPES
    response = LLMResponse(
        provider=Provider.anthropic, model="claude-sonnet-4",
        text="# Conteúdo\n\nGerado pelo teste.", usage={"input_tokens": 10, "output_tokens": 20, "total_tokens": 30},
    )
    monkeypatch.setattr(LLMRouter, "route", lambda *args, **kwargs: response)

    payload = {
        "artifact_definitions": [
            {"type": item, "title": item.replace("_", " ").title(), "can_feed_mission": []} for item in types
        ],
        "step_titles": {"vision": "Visão do produto"},
        "user_model_choice": "claude-sonnet-4",
        "use_user_key": True,
        "idempotency_key": f"idem_{uuid4().hex}",
    }
    created = client.post(f"/api/missions/{mission_id}/deliverables/compile", json=payload)
    assert created.status_code == 202, created.text
    job_id = created.json()["id"]
    _wait_for_status(client, mission_id, job_id, {"DRAFTS_READY"})

    confirmed = client.post(f"/api/missions/{mission_id}/deliverables/jobs/{job_id}/confirm")
    assert confirmed.status_code == 200, confirmed.text
    return job_id


def _drive_room_through_engineering_review_and_stack_approval(client: TestClient, room_id: str) -> None:
    """In test env there's no LLM, so the seeded blueprint is deterministic
    (degraded) -- same reasoning as test_project_rooms.py's
    _engineering_approved_room helper."""
    review = client.post(f"/api/project-rooms/{room_id}/engineering-review")
    assert review.status_code == 200, review.text
    ack = client.post(
        f"/api/project-rooms/{room_id}/acknowledge-preview",
        json={"confirmation": "CONTINUAR COM PREVIEW"},
    )
    assert ack.status_code == 200, ack.text
    approved = client.post(f"/api/project-rooms/{room_id}/approve")
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "ENGINEERING_APPROVED"
    stack = client.post(f"/api/project-rooms/{room_id}/stack/approve", json={})
    assert stack.status_code == 200, stack.text


def test_prepare_project_rejects_non_buildable_mission_type(client: TestClient, monkeypatch) -> None:
    mission = _create_mission(client, mission_type="documentation.create")
    response = client.post(f"/api/missions/{mission['id']}/prepare-project")
    assert response.status_code == 422, response.text


def test_prepare_project_rejects_when_deliverables_not_completed(client: TestClient) -> None:
    mission = _create_mission(client)
    response = client.post(f"/api/missions/{mission['id']}/prepare-project")
    assert response.status_code == 409, response.text


def test_prepare_project_rejects_missing_or_empty_deliverables(client: TestClient, monkeypatch) -> None:
    mission = _create_mission(client)
    _set_answers(client, mission["id"], SOFTWARE_BUILD_ANSWERS)
    # Only 3 of the 7 required types confirmed.
    _compile_and_confirm_all_deliverables(client, mission["id"], monkeypatch, artifact_types=["blueprint", "prompt_md", "architecture"])
    response = client.post(f"/api/missions/{mission['id']}/prepare-project")
    assert response.status_code == 409, response.text


def test_prepare_project_creates_a_real_project_room_with_origin(client: TestClient, monkeypatch) -> None:
    mission = _create_mission(client, title="Acme ERP")
    _set_answers(client, mission["id"], SOFTWARE_BUILD_ANSWERS)
    _compile_and_confirm_all_deliverables(client, mission["id"], monkeypatch)

    response = client.post(f"/api/missions/{mission['id']}/prepare-project")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["mission_id"] == mission["id"]
    assert payload["project_room_id"]
    assert payload["room_status"] == "BLUEPRINT_READY"
    assert payload["engineering_approved"] is False
    assert payload["next_route"] == f"/engineering-review?projectId={payload['project_room_id']}"

    room = client.get(f"/api/project-rooms/{payload['project_room_id']}").json()
    assert room["origin"] == {
        "source": "MISSION_WORKSPACE",
        "mission_id": mission["id"],
        "deliverable_job_id": room["origin"]["deliverable_job_id"],
        "handoff_id": payload["handoff_id"],
    }
    assert room["spec"]["system_type"] == "ERP"
    assert room["spec"]["suggested_stack"]["language"] == "Python"
    assert room["architecture_blueprint"] is not None


def test_prepare_project_called_again_with_unchanged_inputs_is_a_no_op(client: TestClient, monkeypatch) -> None:
    mission = _create_mission(client)
    _set_answers(client, mission["id"], SOFTWARE_BUILD_ANSWERS)
    _compile_and_confirm_all_deliverables(client, mission["id"], monkeypatch)

    first = client.post(f"/api/missions/{mission['id']}/prepare-project").json()
    second = client.post(f"/api/missions/{mission['id']}/prepare-project").json()
    assert second["project_room_id"] == first["project_room_id"]

    room = client.get(f"/api/project-rooms/{first['project_room_id']}").json()
    assert len(room["blueprint_versions"]) == 1
    assert len(room["prompt_master_versions"]) == 1


def test_prepare_project_called_again_after_recompile_reuses_room_but_adds_versions(client: TestClient, monkeypatch) -> None:
    mission = _create_mission(client)
    _set_answers(client, mission["id"], SOFTWARE_BUILD_ANSWERS)
    _compile_and_confirm_all_deliverables(client, mission["id"], monkeypatch)
    first = client.post(f"/api/missions/{mission['id']}/prepare-project").json()

    # Recompile with a changed answer -> new confirmed artifact content -> changed checksum.
    changed_answers = dict(SOFTWARE_BUILD_ANSWERS)
    changed_answers["business_rules.main_rules"] = "Regra 1\nRegra 2\nRegra 3 nova"
    _set_answers(client, mission["id"], changed_answers)
    _compile_and_confirm_all_deliverables(client, mission["id"], monkeypatch)

    second = client.post(f"/api/missions/{mission['id']}/prepare-project").json()
    assert second["project_room_id"] == first["project_room_id"]

    room = client.get(f"/api/project-rooms/{first['project_room_id']}").json()
    assert len(room["blueprint_versions"]) == 2
    assert len(room["prompt_master_versions"]) == 2


def test_start_generation_requires_engineering_review_and_stack_approval(client: TestClient, monkeypatch) -> None:
    mission = _create_mission(client)
    _set_answers(client, mission["id"], SOFTWARE_BUILD_ANSWERS)
    _compile_and_confirm_all_deliverables(client, mission["id"], monkeypatch)
    client.post(f"/api/missions/{mission['id']}/prepare-project")

    response = client.post(f"/api/missions/{mission['id']}/start-generation")
    assert response.status_code == 409, response.text
    assert response.json()["detail"]["code"] == "ENGINEERING_REVIEW_REQUIRED"


def test_start_generation_requires_prepare_project_first(client: TestClient) -> None:
    mission = _create_mission(client)
    response = client.post(f"/api/missions/{mission['id']}/start-generation")
    assert response.status_code == 404, response.text


def test_start_generation_creates_a_real_generation_job_with_source_mission_id(client: TestClient, monkeypatch) -> None:
    mission = _create_mission(client)
    _set_answers(client, mission["id"], SOFTWARE_BUILD_ANSWERS)
    _compile_and_confirm_all_deliverables(client, mission["id"], monkeypatch)
    prepared = client.post(f"/api/missions/{mission['id']}/prepare-project").json()
    _drive_room_through_engineering_review_and_stack_approval(client, prepared["project_room_id"])
    _prevent_real_pipeline_execution(monkeypatch)

    response = client.post(f"/api/missions/{mission['id']}/start-generation")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["mission_id"] == mission["id"]
    assert payload["project_id"] == prepared["project_room_id"]
    assert payload["next_route"] == f"/meta-factory?projectId={prepared['project_room_id']}"

    job = client.get(f"/api/meta-factory/jobs/latest?projectId={prepared['project_room_id']}").json()
    assert job is not None
    assert job["id"] == payload["job_id"]
    assert job["sourceMissionId"] == mission["id"]


def test_start_generation_is_idempotent(client: TestClient, monkeypatch) -> None:
    mission = _create_mission(client)
    _set_answers(client, mission["id"], SOFTWARE_BUILD_ANSWERS)
    _compile_and_confirm_all_deliverables(client, mission["id"], monkeypatch)
    prepared = client.post(f"/api/missions/{mission['id']}/prepare-project").json()
    _drive_room_through_engineering_review_and_stack_approval(client, prepared["project_room_id"])
    _prevent_real_pipeline_execution(monkeypatch)

    first = client.post(f"/api/missions/{mission['id']}/start-generation").json()
    second = client.post(f"/api/missions/{mission['id']}/start-generation").json()
    assert second["job_id"] == first["job_id"]


def test_prepare_project_after_generation_started_does_not_silently_reset_the_room(client: TestClient, monkeypatch) -> None:
    mission = _create_mission(client)
    _set_answers(client, mission["id"], SOFTWARE_BUILD_ANSWERS)
    _compile_and_confirm_all_deliverables(client, mission["id"], monkeypatch)
    prepared = client.post(f"/api/missions/{mission['id']}/prepare-project").json()
    _drive_room_through_engineering_review_and_stack_approval(client, prepared["project_room_id"])
    _prevent_real_pipeline_execution(monkeypatch)
    client.post(f"/api/missions/{mission['id']}/start-generation")

    changed_answers = dict(SOFTWARE_BUILD_ANSWERS)
    changed_answers["business_rules.main_rules"] = "Regra totalmente diferente"
    _set_answers(client, mission["id"], changed_answers)
    _compile_and_confirm_all_deliverables(client, mission["id"], monkeypatch)

    response = client.post(f"/api/missions/{mission['id']}/prepare-project")
    assert response.status_code == 409, response.text


def test_prepare_project_mission_not_found_is_404(client: TestClient) -> None:
    response = client.post("/api/missions/does-not-exist/prepare-project")
    assert response.status_code == 404, response.text
