from __future__ import annotations

import json
import shutil
import tempfile
import time
import zipfile
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

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
from app.schemas.generation_validation import (
    BuildValidationReport,
    DependencyAuditReport,
    GenerationValidationReport,
    ManualBuildFixGuide,
)
from app.services.file_protocol import EmittedFile, ParsedAgentOutput, parse_agent_output
from app.services.generated_project_service import DOWNLOAD_DIR
from app.services.stack_compatibility import DEFAULT_ANCHORS, STACK_LOCK_FILE, stack_compatibility_engine


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


def test_generation_job_carries_a_work_estimate_no_rush_policy(isolated_engine):
    engine, repository, _ = isolated_engine
    job = _create(engine)
    assert job["workEstimate"] is not None
    assert job["workEstimate"]["size_band"] in {"landing_page", "api_simples", "saas", "enterprise"}
    assert job["workEstimate"]["no_rush_message"]

    persisted = repository.get(job["id"], "user-1")
    assert persisted["workEstimate"] == job["workEstimate"]


def test_generation_job_execution_plan_never_drifts_from_its_own_stage_statuses(isolated_engine):
    engine, repository, _ = isolated_engine
    job = _create(engine)
    assert job["executionPlan"] is not None
    plan_ids = [p["id"] for p in job["executionPlan"]["phases"]]
    assert plan_ids == list(job["stageStatuses"].keys())
    assert "mobile" not in plan_ids

    mobile_job = _create_mobile(engine)
    mobile_plan_ids = [p["id"] for p in mobile_job["executionPlan"]["phases"]]
    assert "mobile" in mobile_plan_ids
    assert mobile_plan_ids == list(mobile_job["stageStatuses"].keys())


def test_project_manifest_is_written_to_the_delivered_project(isolated_engine):
    # _write_project_manifest is only ever called from execute() right before READY,
    # after the completeness gate -- exercised directly here (same pattern as
    # test_skipped_build_persists_guide_and_does_not_raise calling _build directly)
    # rather than mocking a full multi-step LLM pipeline just to reach that point.
    engine, repository, root = isolated_engine
    job = _create(engine)
    generated_root = root / "generated-manifest-test"
    generated_root.mkdir()
    job["generatedProjectId"] = "generated-manifest-test"
    job["resultPath"] = str(generated_root)

    engine._write_project_manifest(job, _spec(), {"decisions": [{"area": "database", "choice": "PostgreSQL"}]})

    manifest_path = generated_root / "ldcn.project.json"
    assert manifest_path.is_file()
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert data["project_id"] == "generated-manifest-test"
    assert data["decisions"] == [{"area": "database", "choice": "PostgreSQL"}]
    assert "product-completion-report.json" in data["evidence_files"]


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


def test_skipped_build_persists_guide_and_does_not_raise(isolated_engine, monkeypatch):
    engine, repository, root = isolated_engine
    job = _create(engine)
    source = root / "source.ts"
    source.write_text("export const ok = true;", encoding="utf-8")
    job["artifacts"].append({
        "id": "art_source", "stage": "frontend", "name": "src/source.ts",
        "kind": "generated", "path": str(source), "size_bytes": source.stat().st_size,
        "checksum": "x", "valid": True, "warnings": [], "created_at": engine._now(),
    })
    generated_root = root / "generated"
    generated_root.mkdir()
    writer = SimpleNamespace(write=lambda *args, **kwargs: SimpleNamespace(project_id="generated-1", root_path=generated_root))
    monkeypatch.setattr("app.engines.generation_job_engine.ProjectWriter", lambda: writer)
    guide = ManualBuildFixGuide(
        root_cause="Peer dependency conflict",
        original_error="ERESOLVE",
        affected_files=["package.json"],
        problematic_dependencies=["react"],
        suggested_versions={"react": "18.2.0"},
        commands=["npm install", "npm run build"],
        steps=["Fix package.json"],
        patches_applied=["react 19 -> 18"],
        full_logs="complete ERESOLVE log",
    )
    validation = GenerationValidationReport(
        project_id="generated-1", score=70, passed=False, quality={"checks": []},
        dependency_audit=DependencyAuditReport(status="passed"),
        build=BuildValidationReport(
            installed="failed", built="skipped_after_failure", ok=False,
            skipped_reason="bounded recovery exhausted",
            recovery_status="SKIPPED_AFTER_FAILURE", manual_fix_guide=guide,
        ),
    )
    monkeypatch.setattr(
        "app.engines.generation_job_engine.generation_validation_engine.validate",
        lambda *args, **kwargs: validation,
    )

    engine._build(job, "user-1")

    persisted = repository.get(job["id"], "user-1")
    assert persisted["buildStatus"] == "SKIPPED_AFTER_FAILURE"
    assert persisted["stageStatuses"]["build"] == "skipped"
    assert persisted["manualBuildFixGuide"]["root_cause"] == "Peer dependency conflict"
    assert any(item["name"] == "ManualBuildFixGuide.json" for item in persisted["artifacts"])


def test_build_merges_package_json_from_different_stages_instead_of_dropping_one(isolated_engine, monkeypatch):
    # Regression: backend and frontend each emit their own "package.json" at the
    # same bare relative path when the project shares one root (no apps/backend,
    # apps/frontend split). _build() used to key its "latest emitted file" dict
    # by that bare name, so the later stage's package.json silently overwrote —
    # not merged with — the earlier one, and the earlier stage's ENTIRE
    # dependency list never made it into the published project at all
    # (confirmed against a real end-to-end generation: the backend's NestJS/
    # TypeORM deps were completely absent from the final package.json).
    engine, repository, root = isolated_engine
    job = _create(engine)
    backend_pkg = root / "backend_package.json"
    backend_pkg.write_text(
        json.dumps({"dependencies": {"@nestjs/common": "^10.0.0"}, "scripts": {"start": "nest start"}}),
        encoding="utf-8",
    )
    frontend_pkg = root / "frontend_package.json"
    frontend_pkg.write_text(
        json.dumps({"dependencies": {"next": "^14.0.0"}, "scripts": {"build": "next build"}}),
        encoding="utf-8",
    )
    now = engine._now()
    job["artifacts"].extend([
        {"id": "art_be_pkg", "stage": "backend", "name": "package.json", "kind": "generated", "path": str(backend_pkg), "size_bytes": backend_pkg.stat().st_size, "checksum": "x", "valid": True, "warnings": [], "created_at": now},
        {"id": "art_fe_pkg", "stage": "frontend", "name": "package.json", "kind": "generated", "path": str(frontend_pkg), "size_bytes": frontend_pkg.stat().st_size, "checksum": "x", "valid": True, "warnings": [], "created_at": now},
    ])

    class _FakeWriter:
        captured_files: dict[str, str] | None = None

        def write(self, files, **kwargs):  # noqa: ANN001
            self.captured_files = {f.path: f.content for f in files}
            generated_root = root / "generated2"
            generated_root.mkdir(exist_ok=True)
            return SimpleNamespace(project_id="generated-1", root_path=generated_root)

        def set_verification(self, *args, **kwargs):  # noqa: ANN001
            pass

    fake_writer = _FakeWriter()
    monkeypatch.setattr("app.engines.generation_job_engine.ProjectWriter", lambda: fake_writer)
    validation = GenerationValidationReport(
        project_id="generated-1", score=90, passed=True, quality={"checks": []},
        dependency_audit=DependencyAuditReport(status="passed"),
        build=BuildValidationReport(installed="passed", built="passed", ok=True, recovery_status=None),
    )
    monkeypatch.setattr(
        "app.engines.generation_job_engine.generation_validation_engine.validate",
        lambda *args, **kwargs: validation,
    )

    engine._build(job, "user-1")

    merged = json.loads(fake_writer.captured_files["package.json"])
    assert merged["dependencies"] == {"@nestjs/common": "^10.0.0", "next": "^14.0.0"}
    assert merged["scripts"] == {"start": "nest start", "build": "next build"}


def test_build_merges_tsconfig_json_so_backend_decorators_are_not_silently_dropped(isolated_engine, monkeypatch):
    # Same collision as package.json, confirmed live on a real generation: the
    # frontend's Next.js tsconfig.json overwrote the backend's, silently
    # dropping "experimentalDecorators"/"emitDecoratorMetadata" — which broke
    # every NestJS decorator once `next build`'s typecheck pass (which scans
    # the whole shared src/ tree) hit the backend's controller files.
    engine, repository, root = isolated_engine
    job = _create(engine)
    backend_tsconfig = root / "backend_tsconfig.json"
    backend_tsconfig.write_text(
        json.dumps({"compilerOptions": {"module": "commonjs", "experimentalDecorators": True, "emitDecoratorMetadata": True}}),
        encoding="utf-8",
    )
    frontend_tsconfig = root / "frontend_tsconfig.json"
    frontend_tsconfig.write_text(
        json.dumps({"compilerOptions": {"jsx": "preserve", "module": "esnext"}}),
        encoding="utf-8",
    )
    now = engine._now()
    job["artifacts"].extend([
        {"id": "art_be_ts", "stage": "backend", "name": "tsconfig.json", "kind": "generated", "path": str(backend_tsconfig), "size_bytes": backend_tsconfig.stat().st_size, "checksum": "x", "valid": True, "warnings": [], "created_at": now},
        {"id": "art_fe_ts", "stage": "frontend", "name": "tsconfig.json", "kind": "generated", "path": str(frontend_tsconfig), "size_bytes": frontend_tsconfig.stat().st_size, "checksum": "x", "valid": True, "warnings": [], "created_at": now},
    ])

    class _FakeWriter:
        captured_files: dict[str, str] | None = None

        def write(self, files, **kwargs):  # noqa: ANN001
            self.captured_files = {f.path: f.content for f in files}
            generated_root = root / "generated3"
            generated_root.mkdir(exist_ok=True)
            return SimpleNamespace(project_id="generated-1", root_path=generated_root)

        def set_verification(self, *args, **kwargs):  # noqa: ANN001
            pass

    fake_writer = _FakeWriter()
    monkeypatch.setattr("app.engines.generation_job_engine.ProjectWriter", lambda: fake_writer)
    validation = GenerationValidationReport(
        project_id="generated-1", score=90, passed=True, quality={"checks": []},
        dependency_audit=DependencyAuditReport(status="passed"),
        build=BuildValidationReport(installed="passed", built="passed", ok=True, recovery_status=None),
    )
    monkeypatch.setattr(
        "app.engines.generation_job_engine.generation_validation_engine.validate",
        lambda *args, **kwargs: validation,
    )

    engine._build(job, "user-1")

    merged = json.loads(fake_writer.captured_files["tsconfig.json"])
    assert merged["compilerOptions"]["experimentalDecorators"] is True
    assert merged["compilerOptions"]["emitDecoratorMetadata"] is True
    assert merged["compilerOptions"]["jsx"] == "preserve"
    assert merged["compilerOptions"]["module"] == "esnext"  # later stage wins on an exact key collision


def test_pipeline_continues_to_package_after_build_skip(isolated_engine, monkeypatch):
    engine, repository, _ = isolated_engine
    job = _create(engine)
    executed: list[str] = []

    def fake_step(current, owner, step, *args, **kwargs):  # noqa: ANN001
        executed.append(step.logical)
        if step.logical == "build":
            current["buildStatus"] = "SKIPPED_AFTER_FAILURE"
            current["manualBuildFixGuide"] = {
                "root_cause": "persistent failure", "original_error": "build failed",
                "affected_files": [], "problematic_dependencies": [], "suggested_versions": {},
                "commands": [], "steps": [], "patches_applied": [], "full_logs": "log",
            }

    monkeypatch.setattr(engine, "_execute_step", fake_step)
    engine.execute(job["id"], "user-1", api_key=None, user_model_choice=None)

    completed = repository.get(job["id"], "user-1")
    assert executed[-3:] == ["docs", "build", "package"]
    assert completed["status"] == "READY"
    assert completed["stageStatuses"]["build"] == "skipped"
    assert completed["stageStatuses"]["package"] == "success"
    assert completed["partial"] is True and completed["valid"] is False

    acknowledged = engine.acknowledge_build_skip(job["id"], "user-1")
    assert acknowledged["buildSkipAcknowledged"] is True
    assert engine.acknowledge_build_skip(job["id"], "user-1")["buildSkipAcknowledged"] is True


def test_manual_build_retry_is_bounded(isolated_engine, monkeypatch):
    engine, repository, _ = isolated_engine
    job = _create(engine)
    job["buildStatus"] = "SKIPPED_AFTER_FAILURE"
    job["currentStage"] = "BUILD_RUNNING"
    job["status"] = "READY"
    engine._save(job, "user-1")
    monkeypatch.setattr(engine, "start", lambda *args, **kwargs: None)

    for expected in range(1, 4):
        engine.retry_stage(
            job["id"], "user-1", "build", api_key=None,
            user_model_choice=None, mode="normal",
        )
        assert repository.get(job["id"], "user-1")["manualBuildRetryCount"] == expected

    with pytest.raises(ValueError, match="Limite de 3"):
        engine.retry_stage(
            job["id"], "user-1", "build", api_key=None,
            user_model_choice=None, mode="normal",
        )


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


def test_continue_with_warnings_preserves_the_job_s_original_deterministic_mode(isolated_engine, monkeypatch):
    # A job created without an LLM provider (mode="deterministic") must stay
    # deterministic on recovery -- it must not silently switch to real LLM
    # calls just because it stalled and is being continued past a warning.
    engine, repository, _ = isolated_engine
    job = engine.create_job(
        owner_user_id="user-1", project_id="room-1", workspace_id="enterprise",
        project_name="Orders", spec=_spec(), blueprint={"decisions": []},
        blueprint_version=4, provider=None, provider_label="Nenhum",
        model="Motor deterministico", mode="deterministic",
    )
    _seed_backend_artifact(engine, job, ["Agent wrote outside its territory: pom.xml"])
    job["currentStage"] = "BACKEND_GENERATING"
    job["status"] = "STALLED"
    engine._save(job, "user-1")

    captured = {}
    monkeypatch.setattr(engine, "start", lambda job_id, owner, **kwargs: captured.update(kwargs))
    engine.continue_with_warnings(job["id"], "user-1", api_key=None, user_model_choice=None)

    assert captured["mode"] == "deterministic"


def test_resume_preserves_the_job_s_original_deterministic_mode(isolated_engine, monkeypatch):
    engine, repository, _ = isolated_engine
    job = engine.create_job(
        owner_user_id="user-1", project_id="room-1", workspace_id="enterprise",
        project_name="Orders", spec=_spec(), blueprint={"decisions": []},
        blueprint_version=4, provider=None, provider_label="Nenhum",
        model="Motor deterministico", mode="deterministic",
    )
    job["status"] = "STALLED"
    engine._save(job, "user-1")

    captured = {}
    monkeypatch.setattr(engine, "start", lambda job_id, owner, **kwargs: captured.update(kwargs))
    engine.resume(job["id"], "user-1", api_key=None, user_model_choice=None)

    assert captured["mode"] == "deterministic"


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


def test_list_jobs_route_returns_created_jobs_as_summaries(client, client_scoped_engine, monkeypatch):
    from app.routes import meta_factory as route

    engine = client_scoped_engine
    monkeypatch.setattr(route, "generation_job_engine", engine)
    monkeypatch.setattr(engine, "start", lambda *args, **kwargs: None)
    created = client.post("/api/meta-factory/jobs", json={
        "projectId": "room-list-api", "projectName": "List API Job",
        "spec": _spec().model_dump(mode="json"), "blueprint": {"decisions": []},
        "blueprintVersion": 1, "mode": "deterministic",
    }).json()

    listed = client.get("/api/meta-factory/jobs")
    assert listed.status_code == 200
    ids = [item["id"] for item in listed.json()]
    assert created["id"] in ids
    row = next(item for item in listed.json() if item["id"] == created["id"])
    assert row["projectName"] == "List API Job"
    assert row["archived"] is False
    assert "artifacts" not in row  # summary is lightweight, no heavy fields


def test_archive_job_route_toggles_state_and_is_owner_scoped(client, client_scoped_engine, monkeypatch):
    from app.routes import meta_factory as route

    engine = client_scoped_engine
    monkeypatch.setattr(route, "generation_job_engine", engine)
    monkeypatch.setattr(engine, "start", lambda *args, **kwargs: None)
    created = client.post("/api/meta-factory/jobs", json={
        "projectId": "room-archive-api", "projectName": "Archive API Job",
        "spec": _spec().model_dump(mode="json"), "blueprint": {"decisions": []},
        "blueprintVersion": 1, "mode": "deterministic",
    }).json()

    # Not yet terminal -> archiving is refused.
    refused = client.patch(f"/api/meta-factory/jobs/{created['id']}/archive", json={"archived": True})
    assert refused.status_code == 409

    owner_user_id = client.get("/api/auth/me").json()["user_id"]
    job = engine.repository.get(created["id"], owner_user_id)
    job["status"] = "READY"
    engine.repository.update(created["id"], owner_user_id, job)

    archived = client.patch(f"/api/meta-factory/jobs/{created['id']}/archive", json={"archived": True})
    assert archived.status_code == 200
    assert archived.json()["archived"] is True

    active_list = client.get("/api/meta-factory/jobs", params={"archived": "false"}).json()
    archived_list = client.get("/api/meta-factory/jobs", params={"archived": "true"}).json()
    assert created["id"] not in [item["id"] for item in active_list]
    assert created["id"] in [item["id"] for item in archived_list]


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


# --- delete ------------------------------------------------------------------ #

def test_delete_refuses_jobs_still_in_flight(isolated_engine):
    engine, repository, _ = isolated_engine
    job = _create(engine)  # QUEUED: the runner may still write to it.
    assert engine.delete(job["id"], "user-1") is False
    assert repository.get(job["id"], "user-1") is not None


def test_delete_removes_terminal_job(isolated_engine):
    engine, repository, _ = isolated_engine
    job = _create(engine)
    job["status"] = "FAILED"
    repository.update(job["id"], "user-1", job)

    assert engine.delete(job["id"], "user-1") is True
    assert repository.get(job["id"], "user-1") is None
    # A second delete reports the job as missing.
    assert engine.delete(job["id"], "user-1") is None


def test_delete_unknown_job_returns_none(isolated_engine):
    engine, _, _ = isolated_engine
    assert engine.delete("job_nope", "user-1") is None


def test_delete_is_owner_scoped(isolated_engine):
    engine, repository, _ = isolated_engine
    job = _create(engine)
    job["status"] = "READY"
    repository.update(job["id"], "user-1", job)

    assert engine.delete(job["id"], "user-2") is None


# --- jobs "space": list + archive/unarchive ---------------------------------- #

def test_list_returns_every_job_for_the_owner_newest_first(isolated_engine):
    # _now() truncates to whole seconds, so two jobs created back-to-back in the
    # same test can tie on updatedAt -- set distinct timestamps explicitly
    # instead of relying on real-clock resolution for a deterministic ordering.
    engine, repository, _ = isolated_engine
    first = _create(engine)
    second = _create(engine)
    first["updatedAt"] = "2026-01-01T00:00:00+00:00"
    second["updatedAt"] = "2026-01-02T00:00:00+00:00"
    repository.update(first["id"], "user-1", first)
    repository.update(second["id"], "user-1", second)

    listed = engine.list("user-1")

    assert [job["id"] for job in listed] == [second["id"], first["id"]]


def test_list_filters_by_archived_state(isolated_engine):
    engine, repository, _ = isolated_engine
    active_job = _create(engine)
    archived_job = _create(engine)
    archived_job["status"] = "READY"
    repository.update(archived_job["id"], "user-1", archived_job)
    engine.set_archived(archived_job["id"], "user-1", True)

    assert [job["id"] for job in engine.list("user-1", archived=False)] == [active_job["id"]]
    assert [job["id"] for job in engine.list("user-1", archived=True)] == [archived_job["id"]]
    assert {job["id"] for job in engine.list("user-1")} == {active_job["id"], archived_job["id"]}


def test_list_is_owner_scoped(isolated_engine):
    engine, _, _ = isolated_engine
    _create(engine)
    assert engine.list("user-2") == []


def test_archiving_an_in_flight_job_is_refused(isolated_engine):
    engine, repository, _ = isolated_engine
    job = _create(engine)  # QUEUED

    with pytest.raises(ValueError):
        engine.set_archived(job["id"], "user-1", True)

    assert repository.get(job["id"], "user-1")["archived"] is False


def test_archiving_and_unarchiving_a_terminal_job(isolated_engine):
    engine, repository, _ = isolated_engine
    job = _create(engine)
    job["status"] = "READY"
    repository.update(job["id"], "user-1", job)

    archived = engine.set_archived(job["id"], "user-1", True)
    assert archived["archived"] is True
    assert repository.get(job["id"], "user-1")["archived"] is True

    restored = engine.set_archived(job["id"], "user-1", False)
    assert restored["archived"] is False


def test_archive_unknown_job_returns_none(isolated_engine):
    engine, _, _ = isolated_engine
    assert engine.set_archived("job_nope", "user-1", True) is None


def test_archive_is_owner_scoped(isolated_engine):
    engine, repository, _ = isolated_engine
    job = _create(engine)
    job["status"] = "READY"
    repository.update(job["id"], "user-1", job)

    assert engine.set_archived(job["id"], "user-2", True) is None
    assert repository.get(job["id"], "user-1")["archived"] is False


# --- pre-generation Stack Lock + per-stage Conflict Detector / Import Graph -- #

_PREPARE_STEP = next(step for step in STEPS if step.state == "PREPARING_CONTEXT")
_FRONTEND_GEN = next(step for step in STEPS if step.state == "FRONTEND_GENERATING")
_FRONTEND_VALIDATE = next(step for step in STEPS if step.state == "FRONTEND_VALIDATING")


def _prepare(engine, job, spec, blueprint=None):
    engine._execute_step(job, "user-1", _PREPARE_STEP, spec, blueprint or {"decisions": []}, "", None, None, "full")


def _seed_frontend_manifest(engine, job, dependencies, name="apps/web/package.json"):
    content = json.dumps({"name": "web", "version": "1.0.0", "dependencies": dependencies}, indent=2) + "\n"
    return engine._write_text_artifact(job, "user-1", _FRONTEND_GEN, name, content, "generated", valid=True)


def _seed_frontend_source(engine, job, name, content):
    return engine._write_text_artifact(job, "user-1", _FRONTEND_GEN, name, content, "generated", valid=True)


def test_preparing_context_fixes_stack_lock_before_any_llm_step_for_web_job(isolated_engine):
    engine, _, _ = isolated_engine
    job = _create(engine)  # web delivery_type (default)
    _prepare(engine, job, _spec())

    assert job["stackLock"]["react"] == DEFAULT_ANCHORS["react"]
    assert job["stackLock"]["react_native"] is None
    assert job["stackLock"]["expo"] is None
    assert job["stackLock"]["source_manifest"] == "pre_generation_default"
    lock_artifact = next(a for a in job["artifacts"] if a["name"] == STACK_LOCK_FILE)
    assert lock_artifact["kind"] == "generated"  # carried into the project root by ProjectWriter
    persisted = json.loads(Path(lock_artifact["path"]).read_text(encoding="utf-8"))
    assert persisted["react"] == DEFAULT_ANCHORS["react"]


def test_preparing_context_fixes_stack_lock_with_mobile_anchors_for_mobile_job(isolated_engine):
    engine, _, _ = isolated_engine
    spec = _spec()
    spec.delivery_type = "mobile"
    job = _create_mobile(engine)
    _prepare(engine, job, spec)

    assert job["stackLock"]["react_native"] == DEFAULT_ANCHORS["react_native"]
    assert job["stackLock"]["expo"] == DEFAULT_ANCHORS["expo"]


def test_frontend_llm_context_includes_stack_lock_hint(isolated_engine, monkeypatch):
    engine, _, _ = isolated_engine
    job = _create(engine)
    _prepare(engine, job, _spec())

    captured_contexts: dict[str, str] = {}

    def _fake_agent(router, role, context, model, api_key, language=None, framework=None):  # noqa: ANN001
        captured_contexts[role] = context
        parsed = ParsedAgentOutput(raw_response="ok")
        if role == "contracts":
            parsed.files.append(EmittedFile("openapi.yaml", "openapi: 3.1.0\ninfo:\n  title: x\n  version: 1.0.0\npaths: {}\n"))
        else:
            parsed.files.append(EmittedFile(f"src/{role}/main.ts", "export const x = 1;"))
        return None, parsed

    monkeypatch.setattr("app.engines.generation_job_engine._run_agent", _fake_agent)
    monkeypatch.setattr(engine, "_build", lambda job, owner: None)
    monkeypatch.setattr(engine, "_package", lambda job, owner: None)
    engine.execute(job["id"], "user-1", api_key="secret", user_model_choice="m")

    assert "<stack_lock>" in captured_contexts["frontend"]
    assert DEFAULT_ANCHORS["react"] in captured_contexts["frontend"]
    assert "<stack_lock>" not in captured_contexts["backend"]  # only frontend/mobile get the hint


def test_conflict_detector_restores_drifted_react_after_frontend_stage(isolated_engine):
    engine, _, _ = isolated_engine
    job = _create(engine)
    _prepare(engine, job, _spec())
    manifest_artifact = _seed_frontend_manifest(engine, job, {"react": "^19.0.0", "react-dom": "^19.0.0"})
    _seed_frontend_source(engine, job, "apps/web/src/index.ts", "export const x = 1;")

    engine._validate_stage(job, "user-1", _FRONTEND_VALIDATE)

    restored = json.loads(Path(manifest_artifact["path"]).read_text(encoding="utf-8"))
    assert restored["dependencies"]["react"] == DEFAULT_ANCHORS["react"]  # Stack Lock enforced, never left at 19
    conflicts = next(a for a in job["artifacts"] if a["name"] == "frontend.stack-conflicts.json")
    findings = json.loads(Path(conflicts["path"]).read_text(encoding="utf-8"))
    assert any(f["package"] == "react" and f["status"] == "lock_enforced" for f in findings)
    assert any(event["type"] == "repair_applied" for event in job["events"])


def test_conflict_detector_reconciles_duplicate_dependency_versions_across_manifests(isolated_engine):
    engine, _, _ = isolated_engine
    job = _create(engine)
    _prepare(engine, job, _spec())
    _seed_frontend_manifest(engine, job, {"zod": "^3.22.0"}, name="apps/web/package.json")
    mobile_artifact = _seed_frontend_manifest(engine, job, {"zod": "^3.20.0"}, name="apps/mobile/package.json")
    _seed_frontend_source(engine, job, "apps/web/src/index.ts", "export const x = 1;")

    engine._validate_stage(job, "user-1", _FRONTEND_VALIDATE)

    reconciled = json.loads(Path(mobile_artifact["path"]).read_text(encoding="utf-8"))
    assert reconciled["dependencies"]["zod"] == "^3.22.0"  # reconciled to the first manifest that declared it


def test_conflict_detector_hard_blocks_on_unparseable_manifest(isolated_engine):
    engine, _, _ = isolated_engine
    job = _create(engine)
    _prepare(engine, job, _spec())
    _seed_frontend_manifest(engine, job, {})
    broken = next(a for a in job["artifacts"] if a["name"] == "apps/web/package.json")
    Path(broken["path"]).write_text("{ not valid json", encoding="utf-8")
    _seed_frontend_source(engine, job, "apps/web/src/index.ts", "export const x = 1;")

    with pytest.raises(StageFailure):
        engine._validate_stage(job, "user-1", _FRONTEND_VALIDATE)


def test_manifests_with_the_same_bare_name_from_different_stages_do_not_collide(isolated_engine):
    # Regression: backend and frontend each emit their own "package.json" (bare
    # name, no "apps/" prefix — the real generated-project convention). Keying
    # _collect_manifest_artifacts by bare name alone let the frontend manifest
    # silently clobber the backend one, so every backend-only package (nestjs,
    # typeorm, ...) got flagged as "undeclared_external" the moment the frontend
    # stage's import graph re-scanned every JS/TS file emitted so far, including
    # backend's own files (confirmed against a real end-to-end generation run).
    engine, _, _ = isolated_engine
    job = _create(engine)
    _prepare(engine, job, _spec())
    _seed_frontend_manifest(engine, job, {"react": DEFAULT_ANCHORS["react"]})  # step's stage == "frontend"

    backend_manifest = engine._write_text_artifact(
        job, "user-1", _BACKEND_GEN, "package.json",
        json.dumps({"dependencies": {"@nestjs/common": "^10.0.0"}}), "generated", valid=True,
    )
    engine._write_text_artifact(
        job, "user-1", _BACKEND_GEN, "src/app.module.ts",
        "import { Module } from '@nestjs/common';\nexport class AppModule {}",
        "generated", valid=True,
    )
    _seed_frontend_source(engine, job, "src/index.ts", "export const x = 1;")

    engine._validate_stage(job, "user-1", _FRONTEND_VALIDATE)

    graph_artifact = next(a for a in job["artifacts"] if a["name"] == "frontend.import-graph.json")
    graph = json.loads(Path(graph_artifact["path"]).read_text(encoding="utf-8"))
    assert not any(e["specifier"] == "@nestjs/common" for e in graph["conflicts"])
    # The backend manifest itself must still be intact on disk (never clobbered).
    assert json.loads(Path(backend_manifest["path"]).read_text(encoding="utf-8"))["dependencies"]["@nestjs/common"] == "^10.0.0"


def test_import_graph_gate_reports_undeclared_external_without_blocking(isolated_engine):
    engine, _, _ = isolated_engine
    job = _create(engine)
    _prepare(engine, job, _spec())
    _seed_frontend_manifest(engine, job, {"react": DEFAULT_ANCHORS["react"]})
    _seed_frontend_source(engine, job, "apps/web/src/index.ts", "import axios from 'axios';\nexport const x = 1;")

    engine._validate_stage(job, "user-1", _FRONTEND_VALIDATE)  # report-only: must not raise

    graph_artifact = next(a for a in job["artifacts"] if a["name"] == "frontend.import-graph.json")
    graph = json.loads(Path(graph_artifact["path"]).read_text(encoding="utf-8"))
    assert any(edge["specifier"] == "axios" and edge["status"] == "undeclared_external" for edge in graph["edges"])
    conflicts_artifact = next(a for a in job["artifacts"] if a["name"] == "frontend.import-conflicts.json")
    conflicts = json.loads(Path(conflicts_artifact["path"]).read_text(encoding="utf-8"))
    assert any(c["specifier"] == "axios" for c in conflicts)
