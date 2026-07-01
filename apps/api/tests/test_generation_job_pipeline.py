from __future__ import annotations

import shutil
import tempfile
import time
from pathlib import Path

import pytest

from app.engines.context_pack_builder import build_agent_context
from app.engines.factory_pipeline import _run_agent
from app.engines.generation_job_engine import (
    BACKEND_CHUNKS,
    STEPS,
    GenerationJobEngine,
    PipelineStep,
    StageFailure,
)
from app.engines.llm.base import LLMError
from app.engines.warning_policy import classify, classify_one
from app.repositories.generation_job_repository import GenerationJobRepository
from app.schemas.orchestrator import ProjectSpec
from app.services.file_protocol import EmittedFile, ParsedAgentOutput, parse_agent_output


@pytest.fixture
def isolated_engine():
    root = Path(tempfile.mkdtemp(prefix="ldcn-generation-job-"))
    repository = GenerationJobRepository(root / "jobs.db")
    engine = GenerationJobEngine(repository, root / "checkpoints")
    try:
        yield engine, repository, root
    finally:
        shutil.rmtree(root, ignore_errors=True)


def _spec() -> ProjectSpec:
    return ProjectSpec(
        raw_intent="Sistema enterprise de pedidos",
        product_summary="Operacao de pedidos auditavel",
        entities=["Order", "Customer"],
        business_rules=["Somente operadores aprovam pedidos"],
        core_workflows=["Criar e aprovar pedido"],
    )


def _create(engine: GenerationJobEngine) -> dict:
    return engine.create_job(
        owner_user_id="user-1", project_id="room-1", workspace_id="enterprise",
        project_name="Orders", spec=_spec(), blueprint={"decisions": []},
        blueprint_version=4, provider="anthropic", provider_label="Claude",
        model="claude-sonnet-4",
    )


def test_generation_creates_persistent_job(isolated_engine):
    engine, repository, _ = isolated_engine
    job = _create(engine)
    persisted = repository.get(job["id"], "user-1")
    assert persisted and persisted["status"] == "QUEUED"
    assert persisted["provider"] == "anthropic" and persisted["blueprintVersion"] == 4


def test_refresh_reads_same_progress_and_logs(isolated_engine):
    engine, repository, _ = isolated_engine
    job = _create(engine)
    job["progress"] = 37
    job["logs"].append({"id": "log", "timestamp": job["updatedAt"], "stage": "BACKEND_GENERATING", "level": "info", "message": "chunk", "detail": None})
    engine._save(job, "user-1")
    refreshed = GenerationJobRepository(repository.sqlite_path).get(job["id"], "user-1")
    assert refreshed["progress"] == 37
    assert refreshed["logs"][-1]["message"] == "chunk"


def test_backend_has_required_small_chunks():
    assert BACKEND_CHUNKS == [
        "structure", "package_config", "domain_entities", "dtos", "controllers",
        "services", "repositories", "auth", "validation", "error_handling",
        "tests", "openapi_sync",
    ]
    backend_steps = [step for step in STEPS if step.logical == "backend" and step.action == "llm"]
    assert [step.chunk for step in backend_steps] == BACKEND_CHUNKS


def test_backend_context_pack_is_smaller_and_scoped():
    mega = (
        "## Summary\nOrders\n## Entities\nOrder\n"
        "## Architecture Blueprint (decisoes)\n"
        "- backend: FastAPI - service boundaries\n"
        "- frontend: Next.js - server rendering\n"
        "## Business rules (priority zero)\n" + ("- irrelevant log\n" * 20_000)
    )
    context, diagnostics = build_agent_context("backend", mega)
    assert len(context.encode()) < len(mega.encode())
    assert diagnostics.chars <= diagnostics.budget_chars
    assert "frontend: Next.js" not in context


def test_markdown_output_becomes_valid_artifact():
    parsed = parse_agent_output("Arquivo: src/app.py\n```python\nprint('ok')\n```", agent_role="backend")
    assert parsed.parser_strategy.startswith("markdown")
    assert parsed.files[0].path == "src/app.py"


def test_malformed_json_with_trailing_comma_is_normalized():
    parsed = parse_agent_output('{"files":[{"path":"src/a.ts","content":"export {}"},]}', agent_role="frontend")
    assert parsed.parser_strategy == "json"
    assert parsed.files[0].path == "src/a.ts"


def test_provider_failure_uses_three_progressive_attempts():
    class FailingRouter:
        def __init__(self):
            self.calls = 0

        def route(self, *args, **kwargs):  # noqa: ANN002, ANN003
            self.calls += 1
            raise LLMError("upstream timeout")

    router = FailingRouter()
    response, parsed = _run_agent(router, "backend", "context " * 10_000, "model", "secret")
    assert response is None
    assert router.calls == 3
    assert [item["attempt"] for item in parsed.attempts if item["event"] == "llm_error"] == [1, 2, 3]
    assert parsed.partitioned is True


def test_failure_preserves_raw_response_and_checkpoint(isolated_engine, monkeypatch):
    engine, repository, root = isolated_engine
    job = _create(engine)
    invalid = ParsedAgentOutput(raw_response="provider output without files", errors=["invalid"])
    monkeypatch.setattr("app.engines.generation_job_engine._run_agent", lambda *args, **kwargs: (None, invalid))
    engine.execute(job["id"], "user-1", api_key="secret", user_model_choice="claude-sonnet-4")
    failed = repository.get(job["id"], "user-1")
    assert failed["status"] == "NEEDS_USER_ACTION"
    assert any(item["kind"] == "raw_response" for item in failed["artifacts"])
    assert any(item["status"] == "failed" for item in failed["checkpoints"])
    assert (root / "checkpoints" / job["id"]).exists()


def test_retry_only_restarts_requested_stage(isolated_engine, monkeypatch):
    engine, _, _ = isolated_engine
    job = _create(engine)
    captured = {}

    def fake_start(job_id, owner, **kwargs):  # noqa: ANN001
        captured.update(kwargs)
        return engine.get(job_id, owner)

    monkeypatch.setattr(engine, "start", fake_start)
    engine.retry_stage(job["id"], "user-1", "backend", api_key="secret", user_model_choice="model", mode="partitioned")
    assert captured["start_index"] == next(i for i, step in enumerate(STEPS) if step.logical == "backend")
    assert captured["start_index"] > 0 and captured["mode"] == "partitioned"


def test_explicit_fallback_never_marks_partial_project_ready(isolated_engine):
    engine, repository, _ = isolated_engine
    job = _create(engine)
    engine.execute(job["id"], "user-1", api_key=None, user_model_choice=None, mode="deterministic")
    result = repository.get(job["id"], "user-1")
    assert result["status"] == "NEEDS_USER_ACTION"
    assert result["partial"] is True and result["valid"] is False and result["packageReady"] is False
    assert result["stageStatuses"]["backend"] == "failed"


def test_build_and_package_are_last_and_contracts_are_first():
    states = [step.state for step in STEPS]
    assert states[:4] == ["PREPARING_CONTEXT", "CONTRACTS_PLANNING", "CONTRACTS_GENERATING", "CONTRACTS_VALIDATING"]
    assert states.index("DATABASE_GENERATING") < states.index("BACKEND_GENERATING") < states.index("FRONTEND_GENERATING")
    assert states[-2:] == ["BUILD_RUNNING", "PACKAGE_CREATING"]


def test_failure_diagnostic_is_actionable(isolated_engine):
    engine, _, _ = isolated_engine
    job = _create(engine)
    diagnostic = engine._diagnostic(
        job, "BACKEND_GENERATING", "backend", "payload rejected", http_status=413,
        payload_size=1_200_000, token_estimate=280_000, parser="none",
        validator="artifact_gate", attempt=2, raw_response_path="raw.txt",
    )
    required = {"stage", "agent", "provider", "model", "http_status", "payload_size", "token_estimate", "parser", "validator", "attempt", "raw_response_path", "artifacts_preserved", "recommended_action"}
    assert required <= diagnostic.keys()
    assert diagnostic["http_status"] == 413 and "particionado" in diagnostic["recommended_action"]


# --- Backend stall fix: warning policy, timeout/STALLED, recovery -------------

_BACKEND_VALIDATE = next(step for step in STEPS if step.state == "BACKEND_VALIDATING")
_BACKEND_GEN = next(step for step in STEPS if step.state == "BACKEND_GENERATING")
_BACKEND_PLAN_INDEX = next(i for i, step in enumerate(STEPS) if step.state == "BACKEND_PLANNING")
_FRONTEND_PLAN_INDEX = next(i for i, step in enumerate(STEPS) if step.state == "FRONTEND_PLANNING")


def _seed_backend_artifact(engine, job, warnings):
    return engine._write_text_artifact(
        job, "user-1", _BACKEND_GEN, "src/controllers/order.controller.ts",
        "export class OrderController {}", "generated", valid=True, warnings=warnings,
    )


def test_warning_policy_classifies_common_warnings_as_non_blocking():
    # The exact families behind the "valid + 116 warning(s)" backend stall.
    sample = [
        "Agent 'backend' wrote outside its territory: pom.xml",
        "Missing MANIFEST block; synthesized from emitted files.",
        "docs/traceability.md tem TODOs pendentes",
        "Cobertura de testes parcial neste modulo",
        "Sem marcadores <<<FILE>>>; 4 arquivo(s) recuperado(s) via parser tolerante (markdown).",
    ]
    result = classify(sample * 24)  # ~120 warnings, like the screenshot
    assert result.blocking is False
    assert result.blocking_count == 0
    assert result.warning_count == len(sample) * 24


def test_warning_policy_flags_security_and_structural_as_blocking():
    assert classify_one("Critical security vulnerability: hardcoded secret") == "critical"
    assert classify_one("No FILE blocks found in agent output.") == "blocking_warning"
    assert classify_one("Unrecoverable error while writing module") == "error"
    assert classify(["Critical: hardcoded api_key in source"]).blocking is True


def test_backend_with_non_blocking_warnings_advances(isolated_engine):
    engine, _, _ = isolated_engine
    job = _create(engine)
    _seed_backend_artifact(engine, job, [
        "Agent 'backend' wrote outside its territory: pom.xml",
        "Missing MANIFEST block; synthesized from emitted files.",
    ])
    # Must NOT raise: valid files with advisory warnings cross the gate.
    engine._validate_stage(job, "user-1", _BACKEND_VALIDATE)
    report = next(item for item in reversed(job["artifacts"]) if item["name"] == "backend.validation.json")
    assert report["valid"] is True


def test_backend_with_blocking_error_warning_is_blocked(isolated_engine):
    engine, repository, _ = isolated_engine
    job = _create(engine)
    _seed_backend_artifact(engine, job, ["Unrecoverable error while generating service layer"])
    with pytest.raises(StageFailure):
        engine._validate_stage(job, "user-1", _BACKEND_VALIDATE)


def test_backend_with_critical_warning_is_blocked(isolated_engine):
    engine, _, _ = isolated_engine
    job = _create(engine)
    _seed_backend_artifact(engine, job, ["Critical security vulnerability: hardcoded secret in config"])
    with pytest.raises(StageFailure) as exc:
        engine._validate_stage(job, "user-1", _BACKEND_VALIDATE)
    assert exc.value.diagnostic["blocking_count"] >= 1


def test_backend_generating_never_runs_forever_marks_stalled(isolated_engine, monkeypatch):
    engine, repository, root = isolated_engine
    engine.stage_timeout_seconds = 0.2
    job = _create(engine)

    def _never_returns(*args, **kwargs):  # noqa: ANN002, ANN003
        time.sleep(1.0)
        return None, ParsedAgentOutput(raw_response="late")

    monkeypatch.setattr("app.engines.generation_job_engine._run_agent", _never_returns)
    engine.execute(job["id"], "user-1", api_key="secret", user_model_choice="m", start_index=_BACKEND_PLAN_INDEX)

    result = repository.get(job["id"], "user-1")
    assert result["status"] == "STALLED"  # never eternally 'running'
    assert result["currentStage"] == "BACKEND_GENERATING"
    assert result["stageStatuses"]["backend"] == "stalled"
    assert result["error"]["kind"] == "stall"
    assert result["error"]["next_expected_transition"]
    assert any(cp["status"] == "stalled" for cp in result["checkpoints"])  # checkpoint preserved
    assert (root / "checkpoints" / job["id"]).exists()


def test_user_can_continue_with_warnings(isolated_engine, monkeypatch):
    engine, repository, _ = isolated_engine
    job = _create(engine)
    _seed_backend_artifact(engine, job, ["Agent wrote outside its territory: pom.xml"])
    job["currentStage"] = "BACKEND_GENERATING"
    job["status"] = "STALLED"
    engine._save(job, "user-1")

    captured = {}
    monkeypatch.setattr(engine, "start", lambda job_id, owner, **kwargs: captured.update(kwargs))
    engine.continue_with_warnings(job["id"], "user-1", api_key="secret", user_model_choice="m")

    moved = repository.get(job["id"], "user-1")
    assert moved["status"] == "QUEUED"
    assert moved["stageStatuses"]["backend"] == "success"
    assert captured["start_index"] == _FRONTEND_PLAN_INDEX  # skips remaining backend, starts frontend


def test_pipeline_advances_through_backend_to_frontend_and_completes(isolated_engine, monkeypatch):
    engine, repository, _ = isolated_engine
    job = _create(engine)

    def _fake_agent(router, role, context, model, api_key):  # noqa: ANN001
        parsed = ParsedAgentOutput(raw_response="ok")
        if role == "contracts":
            parsed.files.append(EmittedFile("openapi.yaml", "openapi: 3.1.0\ninfo:\n  title: x\n  version: 1.0.0\npaths: {}\n"))
        else:
            parsed.files.append(EmittedFile(f"src/{role}/main.ts", "export const x = 1;"))
        parsed.warnings.append("TODO: ampliar cobertura de testes")  # non-blocking
        return None, parsed

    progresses: list[int] = []
    original_save = engine._save

    def _spy_save(j, owner):  # noqa: ANN001
        progresses.append(j["progress"])
        return original_save(j, owner)

    monkeypatch.setattr("app.engines.generation_job_engine._run_agent", _fake_agent)
    monkeypatch.setattr(engine, "_build", lambda job, owner: None)
    monkeypatch.setattr(engine, "_package", lambda job, owner: None)
    monkeypatch.setattr(engine, "_save", _spy_save)
    engine.execute(job["id"], "user-1", api_key="secret", user_model_choice="m")

    result = repository.get(job["id"], "user-1")
    assert result["status"] == "READY"
    assert result["progress"] == 100  # progress calculates to completion
    assert result["stageStatuses"]["backend"] == "success"
    assert result["stageStatuses"]["frontend"] == "success"  # next stage ran after backend
    assert progresses == sorted(progresses)  # monotonic, never goes backwards


def test_execution_events_recorded_for_artifacts_and_build_sink(isolated_engine):
    engine, repository, _ = isolated_engine
    job = _create(engine)
    # Writing an artifact emits an artifact_written execution event for the console.
    _seed_backend_artifact(engine, job, [])
    assert any(event["type"] == "artifact_written" for event in job["events"])
    # The build sink streams command events into the same job and persists them.
    sink = engine._build_sink(job, "user-1")
    sink({"type": "command_started", "command": "npm install", "cwd": "/x", "message": "$ npm install"})
    sink({"type": "command_finished", "command": "npm install", "exitCode": 0, "durationMs": 12, "message": "done"})
    persisted = repository.get(job["id"], "user-1")
    types = [event["type"] for event in persisted["events"]]
    assert "command_started" in types and "command_finished" in types
    started = next(event for event in persisted["events"] if event["type"] == "command_started")
    assert started["command"] == "npm install" and started["jobId"] == job["id"]


def test_latest_job_is_owner_scoped(isolated_engine):
    engine, repository, _ = isolated_engine
    job = _create(engine)
    assert repository.latest_for_project("room-1", "user-1")["id"] == job["id"]
    assert repository.latest_for_project("room-1", "other-user") is None


def test_job_api_survives_refresh(client, isolated_engine, monkeypatch):
    from app.routes import meta_factory as route

    engine, _, _ = isolated_engine
    monkeypatch.setattr(route, "generation_job_engine", engine)
    monkeypatch.setattr(engine, "start", lambda *args, **kwargs: None)
    response = client.post("/api/meta-factory/jobs", json={
        "projectId": "room-api", "workspaceId": "enterprise", "projectName": "API Job",
        "spec": _spec().model_dump(mode="json"), "blueprint": {"decisions": []},
        "blueprintVersion": 2, "mode": "deterministic",
    })
    assert response.status_code == 202
    created = response.json()
    latest = client.get("/api/meta-factory/jobs/latest", params={"projectId": "room-api"})
    fetched = client.get(f"/api/meta-factory/jobs/{created['id']}")
    assert latest.status_code == fetched.status_code == 200
    assert latest.json()["id"] == fetched.json()["id"] == created["id"]


def test_llm_job_never_falls_back_silently_without_provider(client, isolated_engine, monkeypatch):
    from app.routes import meta_factory as route

    engine, _, _ = isolated_engine
    monkeypatch.setattr(route, "generation_job_engine", engine)
    response = client.post("/api/meta-factory/jobs", json={
        "projectId": "room-no-provider", "projectName": "No Provider",
        "spec": _spec().model_dump(mode="json"), "blueprint": {}, "mode": "llm",
    })
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "LLM_PROVIDER_REQUIRED"
    assert engine.latest("room-no-provider", response.request.headers.get("x-user", "")) is None
