from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient

from app.engines.llm.base import LLMError
from app.engines.llm.router import LLMRouter
from app.schemas.llm import LLMResponse, Provider
from app.services.ai_key_vault_service import ai_key_vault_service


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


def _create_mission(client: TestClient, mission_type: str = "software.build", title: str = "Missão de teste") -> dict:
    response = client.post("/api/missions", json={"mission_type": mission_type, "title": title})
    assert response.status_code == 201, response.text
    return response.json()


def _validated_key(client: TestClient) -> None:
    """Same pattern test_project_rooms.py uses to get past the "validated user
    key required" gate: register a real key row, then mark it validated so
    llm_provider_resolver.resolve() reports mode == "llm"."""
    client.post("/api/user-ai-keys", json={"provider": "anthropic", "nome": "Minha chave", "api_key": "sk-test-deliverables-1234"})
    user_id = client.get("/api/auth/me").json()["user_id"]
    key_row = ai_key_vault_service.get_default_for_provider(user_id, "anthropic")
    ai_key_vault_service.mark_validated(user_id, key_row["id"], status="valid")


def _compile_payload(idempotency_key: str | None = None, artifact_types: list[str] | None = None) -> dict:
    types = artifact_types or ["blueprint"]
    return {
        "artifact_definitions": [{"type": item, "title": item.replace("_", " ").title(), "can_feed_mission": []} for item in types],
        "step_titles": {"vision": "Visão do produto"},
        "user_model_choice": "claude-sonnet-4",
        "use_user_key": True,
        "idempotency_key": idempotency_key or f"idem_{uuid4().hex}",
    }


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


def test_compile_creates_a_job_that_reaches_drafts_ready_with_drafts_visible_before_confirm(client: TestClient, monkeypatch) -> None:
    mission = _create_mission(client)
    _validated_key(client)
    response = LLMResponse(provider=Provider.anthropic, model="claude-sonnet-4", text="# Blueprint\n\nConteúdo gerado.", usage={"input_tokens": 10, "output_tokens": 20, "total_tokens": 30})
    monkeypatch.setattr(LLMRouter, "route", lambda *args, **kwargs: response)

    created = client.post(f"/api/missions/{mission['id']}/deliverables/compile", json=_compile_payload(artifact_types=["blueprint", "prompt_md"]))
    assert created.status_code == 202, created.text
    job = created.json()
    assert job["status"] in ("QUEUED", "ANSWERS_LOADING", "DRAFTING", "DRAFTS_READY")

    ready = _wait_for_status(client, mission["id"], job["id"], {"DRAFTS_READY", "FAILED"})
    assert ready["status"] == "DRAFTS_READY", ready
    assert len(ready["drafts"]) == 2
    assert all(draft["content"] for draft in ready["drafts"])
    assert {item["status"] for item in ready["artifacts_progress"]} == {"ready"}

    # Nothing is persisted onto the mission until an explicit confirm call.
    mission_state = client.get(f"/api/missions/{mission['id']}").json()
    assert mission_state["artifacts"] == []


def test_idempotent_compile_returns_the_same_job(client: TestClient, monkeypatch) -> None:
    mission = _create_mission(client)
    _validated_key(client)
    response = LLMResponse(provider=Provider.anthropic, model="claude-sonnet-4", text="conteúdo", usage={})
    monkeypatch.setattr(LLMRouter, "route", lambda *args, **kwargs: response)

    key = f"idem_{uuid4().hex}"
    first = client.post(f"/api/missions/{mission['id']}/deliverables/compile", json=_compile_payload(idempotency_key=key))
    assert first.status_code == 202, first.text
    second = client.post(f"/api/missions/{mission['id']}/deliverables/compile", json=_compile_payload(idempotency_key=key))
    assert second.status_code == 200, second.text
    assert second.json()["id"] == first.json()["id"]

    _wait_for_status(client, mission["id"], first.json()["id"], {"DRAFTS_READY", "FAILED"})
    latest = client.get(f"/api/missions/{mission['id']}/deliverables/jobs/latest")
    assert latest.status_code == 200
    assert latest.json()["id"] == first.json()["id"]


def test_confirm_persists_into_mission_and_marks_job_completed(client: TestClient, monkeypatch) -> None:
    mission = _create_mission(client)
    _validated_key(client)
    response = LLMResponse(provider=Provider.anthropic, model="claude-sonnet-4", text="# Conteúdo\n\nGerado pelo teste.", usage={})
    monkeypatch.setattr(LLMRouter, "route", lambda *args, **kwargs: response)

    created = client.post(f"/api/missions/{mission['id']}/deliverables/compile", json=_compile_payload(artifact_types=["blueprint"]))
    job_id = created.json()["id"]
    _wait_for_status(client, mission["id"], job_id, {"DRAFTS_READY"})

    confirmed = client.post(f"/api/missions/{mission['id']}/deliverables/jobs/{job_id}/confirm")
    assert confirmed.status_code == 200, confirmed.text
    mission_state = confirmed.json()
    assert len(mission_state["artifacts"]) == 1
    assert mission_state["artifacts"][0]["content"] == "# Conteúdo\n\nGerado pelo teste."

    job = client.get(f"/api/missions/{mission['id']}/deliverables/jobs/{job_id}").json()
    assert job["status"] == "COMPLETED"


def test_confirm_persists_edited_drafts_not_the_original_generated_content(client: TestClient, monkeypatch) -> None:
    """ArtifactsReviewModal lets the user edit a draft before accepting --
    confirm must persist that edited content, not silently fall back to
    what the LLM originally produced."""
    mission = _create_mission(client)
    _validated_key(client)
    response = LLMResponse(provider=Provider.anthropic, model="claude-sonnet-4", text="# Conteúdo original da IA.", usage={})
    monkeypatch.setattr(LLMRouter, "route", lambda *args, **kwargs: response)

    created = client.post(f"/api/missions/{mission['id']}/deliverables/compile", json=_compile_payload(artifact_types=["blueprint"]))
    job_id = created.json()["id"]
    ready = _wait_for_status(client, mission["id"], job_id, {"DRAFTS_READY"})
    draft = ready["drafts"][0]

    edited = {**draft, "content": "Conteúdo editado pelo usuário antes de aceitar."}
    confirmed = client.post(
        f"/api/missions/{mission['id']}/deliverables/jobs/{job_id}/confirm",
        json={"artifacts": [edited]},
    )
    assert confirmed.status_code == 200, confirmed.text
    mission_state = confirmed.json()
    assert mission_state["artifacts"][0]["content"] == "Conteúdo editado pelo usuário antes de aceitar."


def test_confirm_when_job_is_not_drafts_ready_is_rejected(client: TestClient, monkeypatch) -> None:
    """Confirm must never mark success without artifacts actually being ready
    -- a FAILED job (no drafts) must not be confirmable."""
    mission = _create_mission(client)
    _validated_key(client)

    def _raise(*args, **kwargs):
        raise LLMError("provider indisponível")

    monkeypatch.setattr(LLMRouter, "route", _raise)

    created = client.post(f"/api/missions/{mission['id']}/deliverables/compile", json=_compile_payload(artifact_types=["blueprint"]))
    job_id = created.json()["id"]
    _wait_for_status(client, mission["id"], job_id, {"FAILED"})

    confirmed = client.post(f"/api/missions/{mission['id']}/deliverables/jobs/{job_id}/confirm")
    assert confirmed.status_code == 409, confirmed.text


def test_llm_failure_marks_job_failed_with_diagnostic(client: TestClient, monkeypatch) -> None:
    mission = _create_mission(client)
    _validated_key(client)

    def _raise(*args, **kwargs):
        raise LLMError("provider indisponível", transient=True)

    monkeypatch.setattr(LLMRouter, "route", _raise)

    created = client.post(f"/api/missions/{mission['id']}/deliverables/compile", json=_compile_payload(artifact_types=["blueprint"]))
    job_id = created.json()["id"]
    job = _wait_for_status(client, mission["id"], job_id, {"FAILED"})
    assert job["error"] is not None
    assert job["error"]["kind"] == "llm_error"
    assert job["error"]["message"]
    assert job["artifacts_progress"][0]["status"] == "failed"


def test_retry_after_failure_resumes_only_the_failed_artifact(client: TestClient, monkeypatch) -> None:
    mission = _create_mission(client)
    _validated_key(client)
    calls: list[int] = []

    def _flaky(*args, **kwargs):
        calls.append(1)
        if len(calls) == 2:
            raise LLMError("temporary failure")
        return LLMResponse(provider=Provider.anthropic, model="claude-sonnet-4", text=f"conteúdo {len(calls)}", usage={})

    monkeypatch.setattr(LLMRouter, "route", _flaky)

    created = client.post(f"/api/missions/{mission['id']}/deliverables/compile", json=_compile_payload(artifact_types=["blueprint", "prompt_md"]))
    job_id = created.json()["id"]
    failed = _wait_for_status(client, mission["id"], job_id, {"FAILED"})
    assert len(failed["drafts"]) == 1
    assert failed["drafts"][0]["type"] == "blueprint"
    assert len(calls) == 2

    retried = client.post(f"/api/missions/{mission['id']}/deliverables/jobs/{job_id}/retry", json={"user_model_choice": "claude-sonnet-4", "use_user_key": True})
    assert retried.status_code == 202, retried.text
    ready = _wait_for_status(client, mission["id"], job_id, {"DRAFTS_READY", "FAILED"})
    assert ready["status"] == "DRAFTS_READY", ready
    assert len(ready["drafts"]) == 2
    assert {item["type"] for item in ready["drafts"]} == {"blueprint", "prompt_md"}
    assert len(calls) == 3  # blueprint was never re-drafted


def test_events_endpoint_resumes_via_last_event_id(client: TestClient, monkeypatch) -> None:
    mission = _create_mission(client)
    _validated_key(client)
    response = LLMResponse(provider=Provider.anthropic, model="claude-sonnet-4", text="conteúdo", usage={})
    monkeypatch.setattr(LLMRouter, "route", lambda *args, **kwargs: response)

    created = client.post(f"/api/missions/{mission['id']}/deliverables/compile", json=_compile_payload(artifact_types=["blueprint", "prompt_md"]))
    job_id = created.json()["id"]
    ready = _wait_for_status(client, mission["id"], job_id, {"DRAFTS_READY"})
    events = ready["events"]
    assert len(events) >= 3
    mid_event_id = events[len(events) // 2]["id"]

    full = client.get(f"/api/missions/{mission['id']}/deliverables/jobs/{job_id}/events")
    assert full.status_code == 200
    full_event_ids = [line[len("id: "):].strip() for line in full.text.splitlines() if line.startswith("id: ")]
    assert mid_event_id in full_event_ids

    resumed = client.get(
        f"/api/missions/{mission['id']}/deliverables/jobs/{job_id}/events",
        headers={"Last-Event-ID": mid_event_id},
    )
    assert resumed.status_code == 200
    resumed_event_ids = [line[len("id: "):].strip() for line in resumed.text.splitlines() if line.startswith("id: ")]
    mid_index = full_event_ids.index(mid_event_id)
    assert resumed_event_ids == full_event_ids[mid_index + 1:]


def test_cross_user_cannot_read_another_users_job(client: TestClient, monkeypatch) -> None:
    mission = _create_mission(client)
    _validated_key(client)
    response = LLMResponse(provider=Provider.anthropic, model="claude-sonnet-4", text="conteúdo", usage={})
    monkeypatch.setattr(LLMRouter, "route", lambda *args, **kwargs: response)

    created = client.post(f"/api/missions/{mission['id']}/deliverables/compile", json=_compile_payload(artifact_types=["blueprint"]))
    job_id = created.json()["id"]
    _wait_for_status(client, mission["id"], job_id, {"DRAFTS_READY"})

    other_token = _register_second_user(client)
    other_headers = {"Authorization": f"Bearer {other_token}"}
    assert client.get(f"/api/missions/{mission['id']}/deliverables/jobs/{job_id}", headers=other_headers).status_code == 404
    assert client.get(f"/api/missions/{mission['id']}/deliverables/jobs/latest", headers=other_headers).status_code == 404


def test_reconcile_startup_fails_out_stale_jobs(client: TestClient) -> None:
    from app.routes import mission_deliverable_jobs as mission_deliverable_jobs_route

    mission = _create_mission(client)
    engine = mission_deliverable_jobs_route.engine
    owner_user_id = client.get("/api/auth/me").json()["user_id"]
    stale_time = (datetime.now(UTC) - timedelta(seconds=999)).replace(microsecond=0).isoformat()
    job_id = f"mdjob_{uuid4().hex[:14]}"
    job_data = {
        "id": job_id, "mission_id": mission["id"], "workspace_id": None,
        "status": "DRAFTING", "idempotency_key": f"idem_{uuid4().hex}", "error": None, "degraded": False,
        "artifacts_progress": [{"type": "blueprint", "title": "Blueprint", "status": "drafting"}],
        "drafts": [], "events": [], "created_at": stale_time, "updated_at": stale_time, "completed_at": None,
        "heartbeat_at": stale_time,
        "_artifact_definitions": [{"type": "blueprint", "title": "Blueprint", "can_feed_mission": []}],
        "_step_titles": {}, "_cancel_requested": False,
    }
    engine.repository.create(owner_user_id, job_data)

    result = engine.reconcile_startup()
    assert result["stalled"] == 1

    job = engine.get(job_id, owner_user_id)
    assert job["status"] == "FAILED"
    assert job["error"]["kind"] == "worker_lease_expired"
