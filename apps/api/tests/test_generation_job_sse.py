from __future__ import annotations

from app.core.security import decode_token
from app.engines.generation_job_engine import GenerationJobEngine
from app.repositories.generation_job_repository import GenerationJobRepository
from app.routes import meta_factory as route
from app.schemas.orchestrator import ProjectSpec


def _spec() -> ProjectSpec:
    return ProjectSpec(
        raw_intent="Sistema enterprise de pedidos",
        product_summary="Operacao de pedidos auditavel",
        entities=["Order", "Customer"],
        business_rules=["Somente operadores aprovam pedidos"],
        core_workflows=["Criar e aprovar pedido"],
    )


def test_job_sse_replays_only_events_after_last_event_id(client, monkeypatch):
    token = client.headers["Authorization"].removeprefix("Bearer ")
    owner = str(decode_token(token, expected_type="access")["sub"])
    repository = GenerationJobRepository()
    engine = GenerationJobEngine(repository)
    monkeypatch.setattr(route, "generation_job_engine", engine)
    job = engine.create_job(
        owner_user_id=owner,
        project_id="room-sse",
        workspace_id=None,
        project_name="SSE",
        spec=_spec(),
        blueprint={"decisions": []},
        blueprint_version=1,
        provider=None,
        provider_label="Deterministic",
        model=None,
    )
    engine._emit(job, owner, "info", message="first")
    first_id = job["events"][-1]["id"]
    engine._emit(job, owner, "info", message="second")
    second_id = job["events"][-1]["id"]
    job["status"] = "PAUSED"
    engine._save(job, owner)

    response = client.get(
        f"/api/meta-factory/jobs/{job['id']}/events",
        headers={"Last-Event-ID": first_id},
    )

    assert response.status_code == 200
    assert f"id: {second_id}" in response.text
    assert f"id: {first_id}" not in response.text
    assert '"type": "generation_job"' in response.text


def test_unknown_sse_cursor_replays_retained_window():
    events = [{"id": "evt-a"}, {"id": "evt-b"}]

    assert route._event_start_index(events, "missing") == 0
    assert route._event_start_index(events, "evt-a") == 1
    assert route._event_start_index(events, "evt-b") == 2
