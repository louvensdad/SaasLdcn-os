from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from types import SimpleNamespace

import pytest

import app.models  # noqa: F401
from app.core.database import Base, database_url_for, get_engine, session_factory
from app.engines.generation_job_engine import GenerationJobEngine, PipelineStep
from app.engines.ground_truth_engine import GroundTruthState, ground_truth_engine
from app.engines.warning_policy import classify_one
from app.models.tenant import WorkspaceMembership
from app.repositories.generation_job_repository import GenerationJobRepository
from app.schemas.orchestrator import ProjectSpec
from app.services.execution_reality_guard import execution_reality_guard
from app.services.file_protocol import EmittedFile, ParsedAgentOutput


# The exact incident: after a failed build, an agent answered with a clone of a
# repository that never existed plus docker/deploy instructions.
_HALLUCINATED_CONTINUITY = """## Proximos passos

O projeto foi gerado com sucesso!

git clone https://github.com/medcore-ai/enterprise.git
cd enterprise
docker-compose up -d

Depois faca o deploy em producao com kubectl apply -f deploy/k8s/.
"""


def _failed_state() -> GroundTruthState:
    return GroundTruthState(
        build_status="FAILED", pipeline_status="NEEDS_USER_ACTION",
        pipeline_stage="BUILD_RUNNING", artifacts_status="PARTIAL",
        artifacts_valid_count=12, repo_status="NOT_CREATED",
        docker_status="NOT_READY", last_failed_step="BUILD_RUNNING",
        error_trace="npm ERESOLVE dependency conflict",
    )


def _ready_state(*, repo_created: bool = False) -> GroundTruthState:
    return GroundTruthState(
        build_status="SUCCESS", pipeline_status="READY", pipeline_stage="READY",
        artifacts_status="GENERATED", artifacts_valid_count=40,
        repo_status="CREATED" if repo_created else "NOT_CREATED",
        docker_status="READY", last_failed_step=None, error_trace=None,
    )


# --------- 1. pipeline falhado nao pode gerar instrucoes de deploy/execucao ---

def test_failed_pipeline_blocks_deploy_instructions():
    result = execution_reality_guard.validate(_HALLUCINATED_CONTINUITY, _failed_state(), mode="response")
    rules = {violation.rule for violation in result.violations}
    assert "git_clone_without_repo" in rules
    assert "docker_without_ready_build" in rules
    assert "deploy_without_ready_pipeline" in rules
    assert "invented_success_claim" in rules

    sanitized, _ = execution_reality_guard.sanitize(_HALLUCINATED_CONTINUITY, _failed_state(), mode="response")
    assert "medcore-ai" not in sanitized
    assert "docker-compose up" not in sanitized
    assert "kubectl apply" not in sanitized
    assert "[Reality Guard]" in sanitized  # honest diagnostic note replaces the lie


# ------------------------- 2. git clone so aparece quando o repo existe ------

def test_git_clone_only_when_repo_exists():
    text = "git clone https://github.com/acme/app.git"
    blocked = execution_reality_guard.validate(text, _ready_state(repo_created=False), mode="response")
    assert [violation.rule for violation in blocked.violations] == ["git_clone_without_repo"]
    # Fabricated clone URLs are blocked inside generated project files too.
    blocked_artifact = execution_reality_guard.validate(text, _failed_state(), mode="artifact")
    assert any(violation.rule == "git_clone_without_repo" for violation in blocked_artifact.violations)
    allowed = execution_reality_guard.validate(text, _ready_state(repo_created=True), mode="response")
    assert allowed.ok


# --------------------- 3. docker-compose so aparece quando o build e READY ---

def test_docker_compose_only_when_build_ready():
    text = "Para subir o ambiente: docker compose up --build"
    blocked = execution_reality_guard.validate(text, _failed_state(), mode="response")
    assert any(violation.rule == "docker_without_ready_build" for violation in blocked.violations)
    allowed = execution_reality_guard.validate(text, _ready_state(), mode="response")
    assert allowed.ok
    # Product documentation (artifact mode) may document how to run the FINAL
    # project while the pipeline is healthy — but never in failure state.
    healthy = GroundTruthState(
        build_status="NOT_RUN", pipeline_status="DOCUMENTATION_GENERATING",
        pipeline_stage="DOCUMENTATION_GENERATING", artifacts_status="PARTIAL",
        artifacts_valid_count=10, repo_status="NOT_CREATED",
        docker_status="NOT_READY", last_failed_step=None, error_trace=None,
    )
    assert execution_reality_guard.validate(text, healthy, mode="artifact").ok
    assert not execution_reality_guard.validate(text, _failed_state(), mode="artifact").ok


# ----------------------- 4. LLM nao pode inventar estado do projeto ----------

def test_invented_success_claims_are_blocked():
    for claim in [
        "O projeto foi gerado com sucesso.",
        "Build passou em todos os testes.",
        "Pipeline concluido, pronto para producao.",
        "The app was successfully built and deployed.",
    ]:
        result = execution_reality_guard.validate(claim, _failed_state(), mode="response")
        assert any(v.rule == "invented_success_claim" for v in result.violations), claim
    # The same sentence is legitimate when the pipeline REALLY finished.
    assert execution_reality_guard.validate("O projeto foi gerado com sucesso.", _ready_state(repo_created=True), mode="response").ok


def test_guard_warnings_never_block_the_pipeline():
    # Sanitization annotates artifacts with warnings; those must classify as
    # advisory (non-blocking) under the warning policy.
    warning = "Reality Guard removeu instrucao que contradiz o estado real em README.md: git_clone_without_repo"
    assert classify_one(warning) in {"info", "warning"}


# ------------------------------ ground truth derived from the real job -------

def test_ground_truth_reflects_failed_job():
    job = {
        "status": "NEEDS_USER_ACTION", "currentStage": "BUILD_RUNNING",
        "stageStatuses": {"build": "failed"}, "valid": False, "partial": True,
        "artifacts": [{"kind": "generated", "valid": True, "name": "src/app.ts"}],
        "checkpoints": [], "error": {"stage": "BUILD_RUNNING", "message": "Conflito ERESOLVE"},
    }
    state = ground_truth_engine.from_job(job)
    assert state.build_status == "FAILED"
    assert state.failure is True
    assert state.ready is False
    assert state.repo_status == "NOT_CREATED"
    assert state.docker_status == "NOT_READY"
    assert state.last_failed_step == "BUILD_RUNNING"
    block = ground_truth_engine.prompt_block(state)
    assert "STATUS REAL DO SISTEMA" in block
    assert "BUILD: FAILED" in block
    assert "diagnostic_only_mode" in block  # Failure-Aware Prompting / DIAGNOSTIC ONLY


def test_ground_truth_ready_job_has_no_diagnostic_mode():
    job = {
        "status": "READY", "currentStage": "READY",
        "stageStatuses": {"build": "success"}, "valid": True, "partial": False,
        "artifacts": [
            {"kind": "generated", "valid": True, "name": "docker-compose.yml"},
            {"kind": "generated", "valid": True, "name": "src/app.ts"},
        ],
        "checkpoints": [], "error": None,
    }
    state = ground_truth_engine.from_job(job)
    assert state.ready is True
    assert state.docker_status == "READY"
    assert "diagnostic_only_mode" not in ground_truth_engine.prompt_block(state)


# ------------- 5. respostas refletem o Ground Truth (integracao no engine) ---

@pytest.fixture
def isolated_engine():
    root = Path(tempfile.mkdtemp(prefix="ldcn-ground-truth-"))
    database_path = root / "jobs.db"
    database_url = database_url_for(database_path)
    Base.metadata.create_all(bind=get_engine(database_url))
    with session_factory(database_url).begin() as session:
        session.add(WorkspaceMembership(workspace_id="enterprise", user_id="user-1", role="owner", created_at="2026-01-01T00:00:00+00:00"))
    repository = GenerationJobRepository(database_path)
    engine = GenerationJobEngine(repository, root / "checkpoints")
    try:
        yield engine, root
    finally:
        get_engine(database_url).dispose()
        shutil.rmtree(root, ignore_errors=True)


def _spec() -> ProjectSpec:
    return ProjectSpec(
        raw_intent="Sistema enterprise de pedidos",
        product_summary="Operacao de pedidos auditavel",
        entities=["Order"],
        business_rules=["Somente operadores aprovam pedidos"],
        core_workflows=["Criar e aprovar pedido"],
    )


def test_llm_step_injects_ground_truth_and_sanitizes_hallucination(isolated_engine, monkeypatch):
    engine, _root = isolated_engine
    job = engine.create_job(
        owner_user_id="user-1", project_id="room-1", workspace_id="enterprise",
        project_name="Orders", spec=_spec(), blueprint={"decisions": []},
        blueprint_version=1, provider="anthropic", provider_label="Claude", model="m",
    )
    # Simulate a docs re-run AFTER the build failed.
    job["status"] = "NEEDS_USER_ACTION"
    job["stageStatuses"]["build"] = "failed"
    job["error"] = {"stage": "BUILD_RUNNING", "message": "npm ERESOLVE dependency conflict"}
    engine._save(job, "user-1")

    contexts: list[str] = []

    def fake_agent(router, role, context, model, api_key, language=None, framework=None):  # noqa: ANN001
        contexts.append(context)
        return (
            SimpleNamespace(text=_HALLUCINATED_CONTINUITY, usage=None),
            ParsedAgentOutput(files=[EmittedFile(path="README.md", content=_HALLUCINATED_CONTINUITY)], raw_response=_HALLUCINATED_CONTINUITY),
        )

    monkeypatch.setattr("app.engines.generation_job_engine._run_agent", fake_agent)
    step = PipelineStep("DOCUMENTATION_GENERATING", "docs", "llm", "docs")
    engine._run_llm_step(job, "user-1", step, _spec(), "mega prompt", None, "m", "normal")

    # 1. Ground Truth was MANDATORY in the LLM context, with DIAGNOSTIC ONLY on.
    assert "<ground_truth_state>" in contexts[0]
    assert "BUILD: FAILED" in contexts[0]
    assert "diagnostic_only_mode" in contexts[0]
    # 2. The violating response was rejected and regenerated with failure context.
    assert len(contexts) == 2
    assert "<reality_guard_rejection>" in contexts[1]
    assert "git_clone_without_repo" in contexts[1]
    # 3. The persisted artifact was forcibly sanitized — reality, not the lie.
    readme = next(item for item in job["artifacts"] if item["name"] == "README.md")
    content = Path(readme["path"]).read_text(encoding="utf-8")
    assert "medcore-ai" not in content
    assert "docker-compose up" not in content
    assert "[Reality Guard]" in content
    assert any("Reality Guard" in warning for warning in readme["warnings"])
    # 4. The rejection/sanitization is visible in the live console events.
    assert any(event["type"] == "reality_guard" for event in job["events"])


def test_llm_step_passes_clean_output_untouched(isolated_engine, monkeypatch):
    engine, _root = isolated_engine
    job = engine.create_job(
        owner_user_id="user-1", project_id="room-2", workspace_id="enterprise",
        project_name="Orders", spec=_spec(), blueprint={"decisions": []},
        blueprint_version=1, provider="anthropic", provider_label="Claude", model="m",
    )
    clean = "# Diagnostico\n\nO build falhou por conflito de dependencias; corrija o package.json.\n"
    calls: list[str] = []

    def fake_agent(router, role, context, model, api_key, language=None, framework=None):  # noqa: ANN001
        calls.append(context)
        return (
            SimpleNamespace(text=clean, usage=None),
            ParsedAgentOutput(files=[EmittedFile(path="docs/diagnostico.md", content=clean)], raw_response=clean),
        )

    monkeypatch.setattr("app.engines.generation_job_engine._run_agent", fake_agent)
    step = PipelineStep("DOCUMENTATION_GENERATING", "docs", "llm", "docs")
    engine._run_llm_step(job, "user-1", step, _spec(), "mega prompt", None, "m", "normal")

    assert len(calls) == 1  # no regeneration needed
    artifact = next(item for item in job["artifacts"] if item["name"] == "docs/diagnostico.md")
    assert Path(artifact["path"]).read_text(encoding="utf-8") == clean
    assert not any(event["type"] == "reality_guard" for event in job["events"])


def test_stage_stream_context_carries_default_ground_truth():
    from app.routes.meta_factory import _stage_context
    from app.schemas.meta_factory import StageGenerateRequest

    payload = StageGenerateRequest(spec=_spec(), role="contracts")
    context = _stage_context(payload)
    assert "<ground_truth_state>" in context
    assert "REPOSITORIO GIT REMOTO: NOT_CREATED" in context
