from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

import pytest

from app.core.config import get_settings
from app.engines import evolution_engine
from app.engines.generation_job_engine import GenerationJobEngine
from app.repositories.evolution_signal_repository import EvolutionSignalRepository
from app.repositories.generation_job_repository import GenerationJobRepository
from app.schemas.orchestrator import ProjectSpec, SuggestedStack
from app.services.file_protocol import EmittedFile, ParsedAgentOutput


def _spec(**overrides) -> ProjectSpec:
    defaults = dict(
        raw_intent="Sistema de pedidos",
        product_summary="Operacao de pedidos",
        entities=["Order"],
        core_workflows=["Criar pedido"],
        suggested_stack=SuggestedStack(language="python", framework="fastapi", architecture="clean"),
        delivery_type="web",
    )
    defaults.update(overrides)
    return ProjectSpec(**defaults)


@pytest.fixture
def client_scoped_engine(client):
    checkpoint_root = Path(tempfile.mkdtemp(prefix="ldcn-evolution-test-checkpoints-"))
    repository = GenerationJobRepository(get_settings().sqlite_path)
    engine = GenerationJobEngine(repository, checkpoint_root)
    try:
        yield engine
    finally:
        shutil.rmtree(checkpoint_root, ignore_errors=True)


# --------------------------------------------------------------- pure engine functions

def test_stack_signature_is_deterministic_and_distinguishes_stacks():
    a = evolution_engine.stack_signature_for(_spec())
    b = evolution_engine.stack_signature_for(_spec())
    c = evolution_engine.stack_signature_for(_spec(suggested_stack=SuggestedStack(language="node", framework="express")))
    assert a == b
    assert a != c


def test_insight_with_no_history_is_an_honest_cold_start(client):
    insight = evolution_engine.evolution_insight_for("user-nobody", _spec())
    assert insight.sample_size == 0
    assert insight.certification_rate is None
    assert evolution_engine.prompt_block(insight) is None


def test_insight_reflects_recorded_signals_and_is_owner_scoped(client):
    spec = _spec()
    evolution_engine.record_signal(
        owner_user_id="user-a", spec=spec, model_strategy="balanced",
        outcome="SUCCESS", completeness_status="VERIFIED", repair_cycles=1,
    )
    evolution_engine.record_signal(
        owner_user_id="user-a", spec=spec, model_strategy="balanced",
        outcome="FAILED", completeness_status=None, repair_cycles=3,
    )
    # A different owner's signal for the SAME stack must never leak in.
    evolution_engine.record_signal(
        owner_user_id="user-b", spec=spec, model_strategy="balanced",
        outcome="SUCCESS", completeness_status="VERIFIED", repair_cycles=0,
    )

    insight = evolution_engine.evolution_insight_for("user-a", spec)
    assert insight.sample_size == 2
    assert insight.certification_rate == 0.5
    assert insight.avg_repair_cycles == 2.0
    assert insight.outcome_counts == {"SUCCESS": 1, "FAILED": 1}

    block = evolution_engine.prompt_block(insight)
    assert block is not None
    assert "2 geração" in block


def test_a_failed_generation_still_records_a_signal(client):
    """Fault-isolation is a property of the recording FUNCTION never breaking
    the pipeline -- it must still faithfully record failures, not just
    successes, per the vault's "aprende com ... regressões"."""
    evolution_engine.record_signal(
        owner_user_id="user-c", spec=_spec(), model_strategy="economy",
        outcome="FAILED", completeness_status=None, repair_cycles=2,
    )
    rows = EvolutionSignalRepository(get_settings().sqlite_path).list_for_owner_and_stack(
        "user-c", evolution_engine.stack_signature_for(_spec())
    )
    assert len(rows) == 1
    assert rows[0]["outcome"] == "FAILED"


# --------------------------------------------------------------- generation_job_engine wiring

def test_successful_pipeline_records_an_evolution_signal(client, client_scoped_engine, monkeypatch):
    engine = client_scoped_engine
    spec = _spec()
    job = engine.create_job(
        owner_user_id="user-pipeline", project_id="room-evo-1", workspace_id=None,
        project_name="Evo Test", spec=spec, blueprint={"decisions": []}, blueprint_version=1,
        provider="anthropic", provider_label="Claude", model="claude-sonnet-4-6",
    )

    def _fake_agent(router, role, context, model, api_key, language=None, framework=None, model_strategy=None, **_kwargs):  # noqa: ANN001
        parsed = ParsedAgentOutput(raw_response="ok")
        if role == "contracts":
            parsed.files.append(EmittedFile("openapi.yaml", "openapi: 3.1.0\ninfo:\n  title: x\n  version: 1.0.0\npaths: {}\n"))
        else:
            parsed.files.append(EmittedFile(f"src/{role}/main.ts", "export const x = 1;"))
        return None, parsed

    monkeypatch.setattr("app.engines.generation_job_engine._run_agent", _fake_agent)
    monkeypatch.setattr(engine, "_build", lambda job, owner: None)
    monkeypatch.setattr(engine, "_package", lambda job, owner: None)
    engine.execute(job["id"], "user-pipeline", api_key="secret", user_model_choice="m")

    result = engine.repository.get(job["id"], "user-pipeline")
    assert result["status"] == "READY"

    rows = EvolutionSignalRepository(get_settings().sqlite_path).list_for_owner_and_stack(
        "user-pipeline", evolution_engine.stack_signature_for(spec)
    )
    assert len(rows) == 1
    assert rows[0]["outcome"] in ("SUCCESS", "DEGRADED_CONTINUATION")


def test_second_job_with_the_same_stack_sees_the_first_ones_insight(client, client_scoped_engine, monkeypatch):
    engine = client_scoped_engine
    spec = _spec()

    def _fake_agent(router, role, context, model, api_key, language=None, framework=None, model_strategy=None, **_kwargs):  # noqa: ANN001
        parsed = ParsedAgentOutput(raw_response="ok")
        if role == "contracts":
            parsed.files.append(EmittedFile("openapi.yaml", "openapi: 3.1.0\ninfo:\n  title: x\n  version: 1.0.0\npaths: {}\n"))
        else:
            parsed.files.append(EmittedFile(f"src/{role}/main.ts", "export const x = 1;"))
        return None, parsed

    monkeypatch.setattr("app.engines.generation_job_engine._run_agent", _fake_agent)
    monkeypatch.setattr(engine, "_build", lambda job, owner: None)
    monkeypatch.setattr(engine, "_package", lambda job, owner: None)

    first = engine.create_job(
        owner_user_id="user-seq", project_id="room-evo-2", workspace_id=None,
        project_name="Evo First", spec=spec, blueprint={"decisions": []}, blueprint_version=1,
        provider="anthropic", provider_label="Claude", model="claude-sonnet-4-6",
    )
    engine.execute(first["id"], "user-seq", api_key="secret", user_model_choice="m")

    second = engine.create_job(
        owner_user_id="user-seq", project_id="room-evo-3", workspace_id=None,
        project_name="Evo Second", spec=spec, blueprint={"decisions": []}, blueprint_version=1,
        provider="anthropic", provider_label="Claude", model="claude-sonnet-4-6",
    )
    second_after_prepare = engine.repository.get(second["id"], "user-seq")
    # PREPARING_CONTEXT (the "prepare" step) fixes evolutionInsight before the
    # first LLM call -- create_job() itself doesn't run it, so drive one step.
    engine.execute(second["id"], "user-seq", api_key="secret", user_model_choice="m")
    second_result = engine.repository.get(second["id"], "user-seq")
    assert second_result["evolutionInsight"]["sample_size"] == 1


# --------------------------------------------------------------- route

def test_route_requires_a_compiled_spec(client):
    created = client.post("/api/project-rooms", json={"title": "Evo Route Test", "raw_intent": ""})
    assert created.status_code == 201
    room_id = created.json()["room_id"]

    response = client.get(f"/api/project-rooms/{room_id}/evolution-insight")
    assert response.status_code == 409
