from __future__ import annotations

import pytest

from app.core.config import get_settings
from app.data.agent_territories import territory_violations
from app.engines.agent_prompts import ORCHESTRATOR_SYSTEM_PROMPT
from app.engines.factory_pipeline import pipeline_order_for, run_factory_pipeline
from app.engines.llm.base import LLMAdapter, LLMError
from app.engines.llm.mock_adapter import MockAdapter
from app.engines.llm.router import LLMRouter
from app.engines.orchestrator_engine import compile_mega_prompt
from app.schemas.llm import LLMRequest
from app.schemas.orchestrator import ProjectSpec


class _RaisingAdapter(LLMAdapter):
    """Simulates a provider with no SDK / API key / capability."""

    def complete(self, model, req):  # noqa: ANN001
        raise LLMError("ai_chat capability unavailable")


def _all_raising_router() -> LLMRouter:
    return LLMRouter(
        adapters={"anthropic": _RaisingAdapter(), "openai": _RaisingAdapter(), "google": _RaisingAdapter()}
    )


@pytest.fixture
def fallback_enabled():
    settings = get_settings()
    previous = (settings.mock_fallback_enabled, settings.force_mock)
    settings.mock_fallback_enabled = True
    settings.force_mock = False
    yield settings
    settings.mock_fallback_enabled, settings.force_mock = previous


def test_mock_adapter_orchestrator_returns_valid_spec():
    adapter = MockAdapter()
    req = LLMRequest(
        system=ORCHESTRATOR_SYSTEM_PROMPT,
        user="Ideia do usuario:\nQuero um sistema de reservas em Java Spring Boot.",
        json_schema=ProjectSpec.model_json_schema(),
    )
    response = adapter.complete("claude-sonnet-4-6", req)

    assert response.served_by_fallback is True
    assert response.parsed is not None
    spec = ProjectSpec.model_validate(response.parsed)
    # Above the orchestrator confidence gate so no CLARIFY round is triggered.
    assert spec.confidence >= 0.85
    # Stack inferred from the intent.
    assert spec.suggested_stack.framework == "spring_boot"


def test_router_falls_back_to_mock_when_provider_raises(fallback_enabled):
    router = _all_raising_router()
    response = router.route(
        LLMRequest(system=ORCHESTRATOR_SYSTEM_PROMPT, user="Ideia do usuario:\nApp de tarefas."),
    )
    assert response.served_by_fallback is True
    assert response.stopped_by == "mock_fallback"


def test_router_raises_when_fallback_disabled(fallback_enabled):
    fallback_enabled.mock_fallback_enabled = False
    router = _all_raising_router()
    with pytest.raises(LLMError):
        router.route(LLMRequest(system="x", user="y"))


def test_factory_pipeline_via_mock_emits_all_roles_within_territory(fallback_enabled):
    router = _all_raising_router()
    spec = ProjectSpec(
        raw_intent="Plataforma de relatórios com FastAPI.",
        entities=["Report", "User"],
    )
    mega = compile_mega_prompt(spec)
    result = run_factory_pipeline(mega, router=router)

    assert result.ok, result.errors
    # Web delivery (spec default): every role except mobile runs.
    assert {run.role for run in result.runs} == set(pipeline_order_for(spec.delivery_type))
    # Every emitted file must respect the agent's territory and the run must be a
    # signalled fallback (never disguised as a real model run).
    for run in result.runs:
        assert run.response.served_by_fallback is True
        assert territory_violations(run.role, [f.path for f in run.parsed.files]) == []
        assert run.parsed.files  # each agent emitted at least one file


def test_orchestrate_endpoint_degraded_with_force_mock(client):
    settings = get_settings()
    previous = settings.force_mock
    settings.force_mock = True
    try:
        response = client.post(
            "/api/meta-factory/orchestrate",
            json={"raw_intent": "Quero uma API de pedidos em FastAPI com autenticação."},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["degraded"] is True
        assert body["stage"] == "READY_TO_COMPILE"
        assert body["spec"]["confidence"] >= 0.85
    finally:
        settings.force_mock = previous


def _parse_sse(text: str) -> list[dict]:
    import json as _json
    return [
        _json.loads(line[len("data: "):])
        for line in text.splitlines()
        if line.startswith("data: ")
    ]


def test_generate_stream_emits_progress_events(client):
    settings = get_settings()
    previous = settings.force_mock
    settings.force_mock = True
    try:
        orchestrate = client.post(
            "/api/meta-factory/orchestrate",
            json={"raw_intent": "API de catálogo em FastAPI."},
        ).json()
        response = client.post(
            "/api/meta-factory/generate/stream",
            json={"spec": orchestrate["spec"], "project_name": "stream-demo", "persist": True},
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        events = _parse_sse(response.text)
        types = {e["type"] for e in events}
        assert {"agent_started", "file_emitted", "gate_check", "agent_finished", "written", "done"} <= types

        # Each pipeline role for a web delivery announces a start.
        started = {e["role"] for e in events if e["type"] == "agent_started"}
        assert set(pipeline_order_for(orchestrate["spec"].get("delivery_type"))) <= started

        done = next(e for e in events if e["type"] == "done")
        assert done["ok"] is True
        assert done["degraded"] is True

        written = next(e for e in events if e["type"] == "written")
        assert written["project_id"]
        assert written["file_count"] > 0
    finally:
        settings.force_mock = previous


def test_generate_endpoint_writes_project_in_mock_mode(client):
    settings = get_settings()
    previous = settings.force_mock
    settings.force_mock = True
    try:
        orchestrate = client.post(
            "/api/meta-factory/orchestrate",
            json={"raw_intent": "API de pedidos em FastAPI."},
        ).json()
        generate = client.post(
            "/api/meta-factory/generate",
            json={"spec": orchestrate["spec"], "project_name": "mock-demo", "persist": True},
        )
        assert generate.status_code == 200
        body = generate.json()
        assert body["ok"] is True, body["errors"]
        assert body["degraded"] is True
        assert body["written"] is True
        assert body["file_count"] > 0
        assert body["project_id"]
    finally:
        settings.force_mock = previous
