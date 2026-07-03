from __future__ import annotations

import shutil
import tempfile
import time
import zipfile
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.core.database import Base, database_url_for, get_engine, session_factory
import app.models  # noqa: F401
from app.engines.context_pack_builder import build_agent_context
from app.engines.factory_pipeline import _run_agent
from app.engines.generated_project_quality_engine import GeneratedProjectQualityEngine
from app.engines.generation_job_engine import (
    BACKEND_CHUNKS,
    MOBILE_CHUNKS,
    STEPS,
    GenerationJobEngine,
    JobPaused,
    StageFailure,
    _usage_totals,
    logical_stages_for,
    steps_for,
)
from app.engines.llm.base import LLMError
from app.engines.warning_policy import classify, classify_one
from app.models.tenant import WorkspaceMembership
from app.repositories.generation_job_repository import GenerationJobRepository
from app.schemas.orchestrator import ProjectSpec
from app.services.file_protocol import EmittedFile, ParsedAgentOutput, parse_agent_output
from app.services.generated_project_service import DOWNLOAD_DIR


@pytest.fixture
def isolated_engine():
    root = Path(tempfile.mkdtemp(prefix="ldcn-generation-job-"))
    database_path = root / "jobs.db"
    database_url = database_url_for(database_path)
    Base.metadata.create_all(bind=get_engine(database_url))
    # _create() below associates jobs with workspace_id="enterprise" for
    # owner_user_id="user-1"; seed the membership row the repository's
    # defense-in-depth workspace check requires.
    with session_factory(database_url).begin() as session:
        session.add(WorkspaceMembership(workspace_id="enterprise", user_id="user-1", role="owner", created_at="2026-01-01T00:00:00+00:00"))
    repository = GenerationJobRepository(database_path)
    engine = GenerationJobEngine(repository, root / "checkpoints")
    try:
        yield engine, repository, root
    finally:
        get_engine(database_url).dispose()
        shutil.rmtree(root, ignore_errors=True)


@pytest.fixture
def client_scoped_engine(client):
    """A GenerationJobEngine whose repository shares the *same* database as the
    `client` fixture's app (unlike `isolated_engine`, which is deliberately a
    separate DB) -- needed for route-level tests, since workspace membership
    rows created via the real auth/workspace flow live in the client's DB and
    GenerationJobRepository.create() now checks membership against its own DB."""
    from app.core.config import get_settings

    checkpoint_root = Path(tempfile.mkdtemp(prefix="ldcn-generation-job-checkpoints-"))
    repository = GenerationJobRepository(get_settings().sqlite_path)
    engine = GenerationJobEngine(repository, checkpoint_root)
    try:
        yield engine
    finally:
        shutil.rmtree(checkpoint_root, ignore_errors=True)


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


def _create_mobile(engine: GenerationJobEngine) -> dict:
    spec = _spec()
    spec.delivery_type = "mobile"
    return engine.create_job(
        owner_user_id="user-1", project_id="room-1", workspace_id="enterprise",
        project_name="Orders", spec=spec, blueprint={"decisions": []},
        blueprint_version=4, provider="anthropic", provider_label="Claude",
        model="claude-sonnet-4",
    )


def test_generation_creates_persistent_job(isolated_engine):
    engine, repository, _ = isolated_engine
    job = _create(engine)
    persisted = repository.get(job["id"], "user-1")
    assert persisted and persisted["status"] == "QUEUED"
    assert persisted["provider"] == "anthropic" and persisted["blueprintVersion"] == 4


def test_generation_job_usage_is_persisted_atomically(isolated_engine):
    engine, repository, _ = isolated_engine
    job = _create(engine)

    assert repository.add_usage(job["id"], "other-user", 99, 99) is None
    assert repository.add_usage(job["id"], "user-1", 120, 40) == (120, 40)
    assert repository.add_usage(job["id"], "user-1", 30, 10) == (150, 50)

    restarted = GenerationJobRepository(repository.sqlite_path)
    persisted = restarted.get(job["id"], "user-1")
    assert persisted["inputTokensTotal"] == 150
    assert persisted["outputTokensTotal"] == 50


def test_usage_totals_include_every_format_retry():
    parsed = ParsedAgentOutput()
    parsed.attempts = [
        {"attempt": 1, "tokens": {"input": 100, "output": 20}, "ok": False},
        {"attempt": 2, "tokens": {"input_tokens": 70, "output_tokens": 30}, "ok": True},
    ]
    assert _usage_totals(parsed, None) == (170, 50)

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


def test_steps_for_web_delivery_type_is_unchanged():
    assert steps_for("web") is STEPS
    assert steps_for(None) is STEPS
    assert steps_for("backend") is STEPS  # "backend"-only delivery has no UI at all, web or mobile


def test_steps_for_mobile_delivery_type_inserts_chunked_mobile_stage_after_frontend():
    for delivery_type in ("mobile", "full_stack"):
        steps = steps_for(delivery_type)
        assert steps is not STEPS
        states = [step.state for step in steps]
        frontend_validating = states.index("FRONTEND_VALIDATING")
        mobile_steps = steps[frontend_validating + 1 : frontend_validating + len(MOBILE_CHUNKS) + 3]
        assert mobile_steps[0].state == "MOBILE_PLANNING"
        assert [step.chunk for step in mobile_steps[1:-1]] == MOBILE_CHUNKS
        assert all(step.state == "MOBILE_GENERATING" for step in mobile_steps[1:-1])
        assert mobile_steps[-1].state == "MOBILE_VALIDATING"
        assert steps[frontend_validating + len(MOBILE_CHUNKS) + 3].state == "SECURITY_PLANNING"
        # The web steps themselves are untouched, just spliced around.
        assert [s for s in steps if s.logical != "mobile"] == STEPS
        assert logical_stages_for(steps) == [
            "contracts", "database", "backend", "frontend", "mobile",
            "security", "tests", "docs", "build", "package",
        ]


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


def test_mobile_role_receives_the_contract_summary_like_frontend_does():
    mega = "## Summary\nOrders\n## Core workflows\nCriar pedido\n"
    contract_summary = "<openapi_summary>GET /orders</openapi_summary>"
    context, _diag = build_agent_context("mobile", mega, contract_summary=contract_summary)
    assert contract_summary in context
    assert "frontend: Next.js" not in context


def test_mobile_has_required_small_chunks():
    assert MOBILE_CHUNKS == [
        "structure", "package_config", "screens", "navigation",
        "state_management", "api_client", "native_modules", "tests",
    ]


def test_markdown_output_becomes_valid_artifact():
    parsed = parse_agent_output("Arquivo: src/app.py\n```python\nprint('ok')\n```", agent_role="backend")
    assert parsed.parser_strategy.startswith("markdown")
    assert parsed.files[0].path == "src/app.py"


def test_malformed_json_with_trailing_comma_is_normalized():
    parsed = parse_agent_output('{"files":[{"path":"src/a.ts","content":"export {}"},]}', agent_role="frontend")
    assert parsed.parser_strategy == "json"
    assert parsed.files[0].path == "src/a.ts"


def test_retry_sleep_backs_off_with_jitter(monkeypatch):
    from app.engines import factory_pipeline as fp

    slept: list[float] = []
    monkeypatch.setattr(fp.time, "sleep", lambda seconds: slept.append(seconds))
    fp._retry_sleep(2)
    fp._retry_sleep(3)
    # attempt 2 ~ base + jitter; attempt 3 ~ 2*base + jitter; strictly increasing.
    assert fp._RETRY_BACKOFF_BASE_S <= slept[0] <= fp._RETRY_BACKOFF_BASE_S + fp._RETRY_JITTER_S
    assert 2 * fp._RETRY_BACKOFF_BASE_S <= slept[1] <= 2 * fp._RETRY_BACKOFF_BASE_S + fp._RETRY_JITTER_S
    assert slept[1] > slept[0]


def test_provider_failure_uses_three_progressive_attempts(monkeypatch):
    monkeypatch.setattr("app.engines.factory_pipeline._retry_sleep", lambda *a, **k: None)

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


def test_provider_error_reason_is_redacted(monkeypatch):
    monkeypatch.setattr("app.engines.factory_pipeline._retry_sleep", lambda *a, **k: None)

    class LeakyRouter:
        def route(self, *args, **kwargs):  # noqa: ANN002, ANN003
            raise LLMError("401 Unauthorized Authorization: Bearer sk-ant-api03-LEAKEDKEY1234567890ABCD")

    response, parsed = _run_agent(LeakyRouter(), "backend", "context " * 10, "model", "secret")
    assert response is None
    blob = " ".join(parsed.errors) + " " + " ".join(str(a.get("reason", "")) for a in parsed.attempts)
    assert "sk-ant-api03-LEAKEDKEY" not in blob  # the key must never be recorded/logged
    assert "[REDACTED]" in blob


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


def test_pause_cooperatively_stops_waiting_for_provider(isolated_engine, monkeypatch):
    engine, _, _ = isolated_engine
    job = _create(engine)
    engine.pause(job["id"], "user-1")

    class PendingFuture:
        cancelled = False

        def result(self, timeout):  # noqa: ANN001
            raise TimeoutError

        def cancel(self):
            self.cancelled = True
            return True

    pending = PendingFuture()
    monkeypatch.setattr(
        "app.engines.generation_job_engine.submit_agent",
        lambda *args, **kwargs: pending,
    )

    with pytest.raises(JobPaused):
        engine._route_with_timeout(
            job,
            "user-1",
            _BACKEND_GEN,
            "backend",
            "context",
            "model",
            "secret",
        )

    assert pending.cancelled is True


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

    def _fake_agent(router, role, context, model, api_key, language=None, framework=None):  # noqa: ANN001
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


def test_mobile_delivery_type_pipeline_advances_through_mobile_stage_and_completes(isolated_engine, monkeypatch):
    """Mobile Factory Phase 1 walking skeleton: a job whose spec.delivery_type is
    'mobile' runs the extra MOBILE_PLANNING/GENERATING/VALIDATING trio (inserted
    by steps_for) and reaches READY, same as the web-only pipeline."""
    engine, repository, _ = isolated_engine
    job = _create_mobile(engine)
    assert "mobile" in job["stageStatuses"]  # stageStatuses already reflects the mobile-inclusive step list

    def _fake_agent(router, role, context, model, api_key, language=None, framework=None):  # noqa: ANN001
        parsed = ParsedAgentOutput(raw_response="ok")
        if role == "contracts":
            parsed.files.append(EmittedFile("openapi.yaml", "openapi: 3.1.0\ninfo:\n  title: x\n  version: 1.0.0\npaths: {}\n"))
        elif role == "mobile":
            parsed.files.extend([
                EmittedFile("apps/mobile/app.json", '{"expo":{"name":"Orders","slug":"orders"}}'),
                EmittedFile("apps/mobile/package.json", '{"scripts":{"build":"tsc --noEmit"}}'),
                EmittedFile("apps/mobile/tsconfig.json", '{"compilerOptions":{"strict":true}}'),
                EmittedFile("apps/mobile/App.tsx", "export default function App() { return null; }"),
                EmittedFile("apps/mobile/.env.example", "EXPO_PUBLIC_API_URL=http://localhost:8000"),
                EmittedFile("apps/mobile/src/api/client.ts", "export const api = {};"),
            ])
        else:
            parsed.files.append(EmittedFile(f"src/{role}/main.ts", "export const x = 1;"))
        return None, parsed

    monkeypatch.setattr("app.engines.generation_job_engine._run_agent", _fake_agent)
    monkeypatch.setattr(engine, "_build", lambda job, owner: None)
    monkeypatch.setattr(engine, "_package", lambda job, owner: None)
    engine.execute(job["id"], "user-1", api_key="secret", user_model_choice="m")

    result = repository.get(job["id"], "user-1")
    assert result["status"] == "READY"
    assert result["progress"] == 100
    assert result["stageStatuses"]["mobile"] == "success"
    assert result["stageStatuses"]["frontend"] == "success"
    assert result["stageStatuses"]["security"] == "success"  # pipeline continued past mobile
    mobile_artifacts = [a for a in result["artifacts"] if a["stage"].startswith("mobile.") and a["kind"] == "generated"]
    assert any(a["name"] == "apps/mobile/App.tsx" for a in mobile_artifacts)


def test_mobile_job_resume_and_retry_use_the_mobile_inclusive_step_list(isolated_engine):
    """resume()/retry_stage() resolve the job's own step list (via
    _steps_for_job) rather than the web-only default -- otherwise a stalled or
    failed mobile job would resume/retry at the wrong index."""
    engine, _, _ = isolated_engine
    job = _create_mobile(engine)

    steps = engine._steps_for_job(job["id"], "user-1")
    target_chunk = "api_client"
    job["currentStage"] = "MOBILE_GENERATING"
    job["checkpoints"].append({"stage": "MOBILE_GENERATING", "chunk": target_chunk, "status": "failed"})
    retry_index = engine._recovery_index(job, steps, "MOBILE_GENERATING")
    assert steps[retry_index].chunk == target_chunk

    resume_index = engine._step_index("MOBILE_VALIDATING", engine._steps_for_job(job["id"], "user-1"))
    assert steps_for("mobile")[resume_index].state == "MOBILE_VALIDATING"


def test_flutter_job_is_rejected_until_phase_5(isolated_engine):
    engine, _, _ = isolated_engine
    spec = _spec()
    spec.delivery_type = "mobile"
    spec.mobile_stack = "flutter"
    with pytest.raises(ValueError, match="Phase 5"):
        engine.create_job(
            owner_user_id="user-1", project_id="room-1", workspace_id="enterprise",
            project_name="Orders", spec=spec, blueprint={"decisions": []},
            blueprint_version=4, provider="anthropic", provider_label="Claude",
            model="claude-sonnet-4",
        )


def test_mobile_job_reaches_ready_and_packages_real_mobile_zip(isolated_engine, monkeypatch):
    engine, repository, _ = isolated_engine
    job = _create_mobile(engine)

    def _fake_agent(router, role, context, model, api_key, language=None, framework=None):  # noqa: ANN001
        parsed = ParsedAgentOutput(raw_response="ok")
        if role == "contracts":
            parsed.files.append(EmittedFile("openapi.yaml", "openapi: 3.1.0\ninfo:\n  title: Orders\n  version: 1.0.0\npaths: {}\n"))
        elif role == "mobile":
            parsed.files.extend([
                EmittedFile("apps/mobile/app.json", '{"expo":{"name":"Orders","slug":"orders"}}'),
                EmittedFile("apps/mobile/package.json", '{"scripts":{"start":"expo start","build":"node -p \\"1\\""}}'),
                EmittedFile("apps/mobile/tsconfig.json", '{"compilerOptions":{"strict":true}}'),
                EmittedFile("apps/mobile/App.tsx", "export default function App() { return null; }"),
                EmittedFile("apps/mobile/src/api/client.ts", "export const api = {};"),
                EmittedFile("apps/mobile/src/screens/Home.tsx", "export const Home = () => null;"),
                EmittedFile("apps/mobile/src/navigation/index.ts", "export const navigation = {};"),
                EmittedFile("apps/mobile/tests/app.test.ts", "export {};"),
                EmittedFile("apps/mobile/README.md", "# Mobile\n\nRun with npm run start."),
                EmittedFile("apps/mobile/.env.example", "EXPO_PUBLIC_API_URL=http://localhost:8000"),
                EmittedFile("apps/mobile/.gitignore", "node_modules/\nios/\nandroid/\n"),
            ])
        elif role == "docs":
            parsed.files.extend([
                EmittedFile("README.md", "# Orders\n\nGenerated by LDCN OS. Run the mobile app with npm run start."),
                EmittedFile(".ldcn-backend-generation.json", '{"framework":"expo"}'),
            ])
        else:
            parsed.files.append(EmittedFile(f"generated/{role}/main.txt", "generated"))
        return None, parsed

    monkeypatch.setattr("app.engines.generation_job_engine._run_agent", _fake_agent)
    engine.execute(job["id"], "user-1", api_key="secret", user_model_choice="m")

    result = repository.get(job["id"], "user-1")
    generated_root = Path(result["resultPath"]) if result.get("resultPath") else None
    zip_path = DOWNLOAD_DIR / f"{result.get('generatedProjectId')}.zip"
    try:
        assert result["status"] == "READY", (result.get("error") or {}).get("message")
        assert zip_path.is_file()
        with zipfile.ZipFile(zip_path) as archive:
            names = set(archive.namelist())
        assert "apps/mobile/App.tsx" in names
        assert "apps/mobile/package.json" in names
        assert not any("node_modules" in name.split("/") for name in names)
        revalidated = GeneratedProjectQualityEngine().quality_check(
            {"project_id": result["generatedProjectId"], "generated_project_path": str(generated_root)}
        )
        assert any(
            check["id"] == "zip_root_safe" and check["status"] == "passed"
            for check in revalidated["checks"]
        )
    finally:
        if generated_root is not None:
            shutil.rmtree(generated_root, ignore_errors=True)
        zip_path.unlink(missing_ok=True)


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


def test_workspace_members_can_read_but_only_writers_can_update_generation_job(isolated_engine):
    from app.core.database import session_factory

    engine, repository, root = isolated_engine
    job = _create(engine)  # owner_user_id="user-1", workspace_id="enterprise"

    database_url = database_url_for(repository.sqlite_path)
    with session_factory(database_url).begin() as session:
        session.add(WorkspaceMembership(workspace_id="enterprise", user_id="viewer-user", role="viewer", created_at="2026-01-01T00:00:00+00:00"))
        session.add(WorkspaceMembership(workspace_id="enterprise", user_id="member-user", role="member", created_at="2026-01-01T00:00:00+00:00"))

    # Viewers can read the job (any workspace membership grants read access)...
    assert repository.get(job["id"], "viewer-user")["id"] == job["id"]
    assert repository.latest_for_project("room-1", "viewer-user")["id"] == job["id"]
    assert any(item["id"] == job["id"] for item in repository.list("viewer-user"))
    # ...but cannot write to it.
    assert repository.update(job["id"], "viewer-user", {**job, "status": "READY"}) is None
    assert repository.add_usage(job["id"], "viewer-user", 10, 5) is None

    # Members (write role) can both read and write.
    assert repository.get(job["id"], "member-user")["id"] == job["id"]
    assert repository.add_usage(job["id"], "member-user", 10, 5) == (10, 5)


def test_generation_job_repository_rejects_create_for_non_member_workspace(isolated_engine):
    engine, repository, _ = isolated_engine
    with pytest.raises(PermissionError):
        repository.create(
            "outsider",
            {
                "id": "genjob_outsider", "projectId": "room-x", "workspaceId": "enterprise",
                "createdAt": "2026-01-01T00:00:00+00:00", "updatedAt": "2026-01-01T00:00:00+00:00",
            },
            {}, {},
        )


def test_job_api_survives_refresh(client, client_scoped_engine, monkeypatch):
    from app.routes import meta_factory as route

    engine = client_scoped_engine
    monkeypatch.setattr(route, "generation_job_engine", engine)
    monkeypatch.setattr(engine, "start", lambda *args, **kwargs: None)
    response = client.post("/api/meta-factory/jobs", json={
        "projectId": "room-api", "projectName": "API Job",
        "spec": _spec().model_dump(mode="json"), "blueprint": {"decisions": []},
        "blueprintVersion": 2, "mode": "deterministic",
    })
    assert response.status_code == 202
    created = response.json()
    latest = client.get("/api/meta-factory/jobs/latest", params={"projectId": "room-api"})
    fetched = client.get(f"/api/meta-factory/jobs/{created['id']}")
    assert latest.status_code == fetched.status_code == 200
    assert latest.json()["id"] == fetched.json()["id"] == created["id"]


def test_count_active_for_user_excludes_terminal(isolated_engine):
    engine, _, _ = isolated_engine
    job = _create(engine)
    assert engine.count_active_for_user("user-1") == 1  # QUEUED counts as in flight
    assert engine.count_active_for_user("other-user") == 0  # owner-scoped
    job["status"] = "READY"
    engine._save(job, "user-1")
    assert engine.count_active_for_user("user-1") == 0  # terminal no longer counts


def test_create_generation_job_caps_concurrency_per_user(client, client_scoped_engine, monkeypatch):
    from app.core.config import get_settings
    from app.routes import meta_factory as route

    engine = client_scoped_engine
    monkeypatch.setattr(route, "generation_job_engine", engine)
    monkeypatch.setattr(engine, "start", lambda *args, **kwargs: None)
    monkeypatch.setattr(get_settings(), "max_concurrent_generations_per_user", 2)

    def _post(project_id: str):
        return client.post("/api/meta-factory/jobs", json={
            "projectId": project_id, "projectName": "Job",
            "spec": _spec().model_dump(mode="json"), "blueprint": {"decisions": []},
            "blueprintVersion": 1, "mode": "deterministic",
        })

    assert _post("room-c1").status_code == 202
    assert _post("room-c2").status_code == 202
    third = _post("room-c3")
    assert third.status_code == 429
    assert third.json()["detail"]["code"] == "TOO_MANY_CONCURRENT_GENERATIONS"
    assert third.json()["detail"]["limit"] == 2


def test_usage_summary_aggregates_per_user_and_model(isolated_engine):
    engine, repository, _ = isolated_engine
    job = _create(engine)  # model claude-sonnet-4
    repository.add_usage(job["id"], "user-1", 100, 40)
    repository.add_usage(job["id"], "user-1", 50, 10)

    summary = engine.usage_summary("user-1")
    assert summary["input_tokens"] == 150
    assert summary["output_tokens"] == 50
    assert summary["total_tokens"] == 200
    assert summary["job_count"] == 1
    assert summary["by_model"][0]["model"] == "claude-sonnet-4"
    assert summary["by_model"][0]["input_tokens"] == 150
    # Owner-scoped: another user sees nothing.
    assert engine.usage_summary("other-user")["total_tokens"] == 0


def test_usage_summary_respects_since_window(isolated_engine):
    engine, repository, _ = isolated_engine
    job = _create(engine)
    repository.add_usage(job["id"], "user-1", 10, 5)

    future = (datetime.now(UTC) + timedelta(days=1)).replace(microsecond=0).isoformat()
    past = (datetime.now(UTC) - timedelta(days=1)).replace(microsecond=0).isoformat()
    assert engine.usage_summary("user-1", since=future)["total_tokens"] == 0
    assert engine.usage_summary("user-1", since=past)["total_tokens"] == 15


def test_usage_endpoint_returns_measured_owner_summary(client, client_scoped_engine, monkeypatch):
    from app.routes import meta_factory as route

    engine = client_scoped_engine
    repository = engine.repository
    monkeypatch.setattr(route, "generation_job_engine", engine)
    monkeypatch.setattr(engine, "start", lambda *args, **kwargs: None)

    created = client.post("/api/meta-factory/jobs", json={
        "projectId": "room-usage", "projectName": "Usage Job",
        "spec": _spec().model_dump(mode="json"), "blueprint": {"decisions": []},
        "blueprintVersion": 1, "mode": "deterministic",
    })
    assert created.status_code == 202
    user_id = client.get("/api/auth/me").json()["user_id"]
    repository.add_usage(created.json()["id"], user_id, 120, 30)

    usage = client.get("/api/meta-factory/jobs/usage", params={"period_days": 30})
    assert usage.status_code == 200, usage.text
    body = usage.json()
    assert body["input_tokens"] == 120 and body["output_tokens"] == 30
    assert body["total_tokens"] == 150 and body["job_count"] == 1


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
