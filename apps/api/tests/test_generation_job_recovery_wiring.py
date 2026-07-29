from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.core.database import Base, database_url_for, get_engine, session_factory
import app.models  # noqa: F401
from app.engines.generation_job_engine import GenerationJobEngine, StageFailure
from app.models.tenant import WorkspaceMembership
from app.repositories.generation_job_repository import GenerationJobRepository
from app.schemas.generation_validation import BuildValidationReport, DependencyAuditReport, GenerationValidationReport
from app.schemas.orchestrator import ProjectSpec
from app.services.project_writer import DEFAULT_OUTPUT_ROOT

# Real, end-to-end wiring tests for PipelineRecoveryOrchestrator hooked into
# GenerationJobEngine._build() (PARTE 12 of the request): a ProjectWriteError
# raised by the *real* ProjectWriter/artifact_security must no longer fall
# straight into a generic FAILED job -- it must route through the diagnosis
# team first. Uses the real ProjectWriter (not a fake) so this actually
# exercises the fixed classifier + orchestrator together, not just the mocks.


@pytest.fixture
def isolated_engine():
    root = Path(tempfile.mkdtemp(prefix="ldcn-recovery-wiring-"))
    database_path = root / "jobs.db"
    database_url = database_url_for(database_path)
    Base.metadata.create_all(bind=get_engine(database_url))
    with session_factory(database_url).begin() as session:
        session.add(WorkspaceMembership(workspace_id="enterprise", user_id="user-1", role="owner", created_at="2026-01-01T00:00:00+00:00"))
    repository = GenerationJobRepository(database_path)
    engine = GenerationJobEngine(repository, root / "checkpoints")
    created_projects: list[str] = []
    try:
        yield engine, repository, root, created_projects
    finally:
        get_engine(database_url).dispose()
        shutil.rmtree(root, ignore_errors=True)
        for project_id in created_projects:
            shutil.rmtree(DEFAULT_OUTPUT_ROOT / project_id, ignore_errors=True)


def _spec() -> ProjectSpec:
    return ProjectSpec(
        raw_intent="Sistema de autenticacao",
        product_summary="Backend de autenticacao",
        entities=["User"],
        business_rules=["Somente usuarios autenticados acessam dados"],
        core_workflows=["Login e emissao de token"],
    )


def _create(engine: GenerationJobEngine) -> dict:
    return engine.create_job(
        owner_user_id="user-1", project_id="room-1", workspace_id="enterprise",
        project_name="AuthService", spec=_spec(), blueprint={"decisions": []},
        blueprint_version=1, provider="anthropic", provider_label="Claude",
        model="claude-sonnet-4",
    )


def _add_artifact(engine: GenerationJobEngine, job: dict, root: Path, name: str, content: str) -> None:
    path = root / f"src_{len(job['artifacts'])}.txt"
    path.write_text(content, encoding="utf-8")
    job["artifacts"].append({
        "id": f"art_{len(job['artifacts'])}", "stage": "backend", "name": name,
        "kind": "generated", "path": str(path), "size_bytes": path.stat().st_size,
        "checksum": "x", "valid": True, "warnings": [], "created_at": engine._now(),
    })


def _passing_validation() -> GenerationValidationReport:
    return GenerationValidationReport(
        project_id="ignored", score=95, passed=True, quality={"checks": []},
        dependency_audit=DependencyAuditReport(status="passed"),
        build=BuildValidationReport(installed="passed", built="passed", ok=True, recovery_status=None),
    )


class TestRealPreviouslyReportedScenarioNoLongerBlocks:
    def test_env_example_placeholder_no_longer_blocks_the_build(self, isolated_engine, monkeypatch):
        # The exact shape of content from the real historical job
        # (generated-projects/jobs/genjob_3be298b1d64b42/backend/raw/backend-auth.txt):
        # JWT_SECRET=your-256-bit-secret-key-here..., SMTP_PASSWORD=your-sendgrid-api-key,
        # DB_PASSWORD=changeme -- all placeholders inside a .env.example.
        engine, repository, root, created = isolated_engine
        job = _create(engine)
        _add_artifact(
            engine, job, root, "backend/.env.example",
            "JWT_SECRET=your-256-bit-secret-key-here-must-be-at-least-256-bits-long\n"
            "SMTP_PASSWORD=your-sendgrid-api-key\nDB_PASSWORD=changeme\n",
        )
        monkeypatch.setattr(
            "app.engines.generation_job_engine.generation_validation_engine.validate",
            lambda *a, **k: _passing_validation(),
        )

        engine._build(job, "user-1")  # must not raise

        assert job["buildStatus"] == "PASSED"
        created.append(job["generatedProjectId"])
        assert not any(a["kind"] == "recovery_run" for a in job["artifacts"]), "no recovery should have been needed at all"

    def test_reported_bug_scenario_hardcoded_secret_in_auth_service_still_blocks(self, isolated_engine, monkeypatch):
        # The literal scenario from the bug report: a real-looking secret
        # hardcoded in auth_service.py. This must still block -- the fix was
        # narrowing false positives, never disabling real-secret detection.
        engine, repository, root, created = isolated_engine
        job = _create(engine)
        _add_artifact(
            engine, job, root, "backend/app/application/services/auth_service.py",
            'SECRET_KEY = "Xk9#mP2$vQ7nZ4wR8tY1uL5cB3sA6dF0"\n',
        )
        monkeypatch.setattr(
            "app.engines.generation_job_engine.generation_validation_engine.validate",
            lambda *a, **k: _passing_validation(),
        )

        with pytest.raises(StageFailure):
            engine._build(job, "user-1")

        assert job.get("generatedProjectId") is None, "no project may be created/duplicated from a blocked build"


class TestRecoveryOrchestratorWiring:
    def test_real_secret_runs_diagnosis_team_and_halts_for_approval_not_generic_failed(self, isolated_engine, monkeypatch):
        engine, repository, root, created = isolated_engine
        job = _create(engine)
        _add_artifact(
            engine, job, root, "backend/app/application/services/auth_service.py",
            'SECRET_KEY = "Xk9#mP2$vQ7nZ4wR8tY1uL5cB3sA6dF0"\n',
        )
        monkeypatch.setattr(
            "app.engines.generation_job_engine.generation_validation_engine.validate",
            lambda *a, **k: _passing_validation(),
        )

        with pytest.raises(StageFailure) as excinfo:
            engine._build(job, "user-1")

        # The diagnosis team actually ran (not a bare generic exception path):
        # a recovery_run artifact was persisted with all three agents' output.
        recovery_artifacts = [a for a in job["artifacts"] if a["kind"] == "recovery_run"]
        assert len(recovery_artifacts) == 1
        recovery_content = Path(recovery_artifacts[0]["path"]).read_text(encoding="utf-8")
        assert '"classification": "REAL_SECRET"' in recovery_content
        assert '"state": "WAITING_REPAIR_APPROVAL"' in recovery_content
        # Events for each real stage of the diagnosis were emitted to the live console.
        recovery_events = [e for e in job["events"] if e["message"].startswith("[recovery:")]
        assert len(recovery_events) >= 4  # diagnosis_queued, root_cause, cause_validating(x2), waiting_approval

    def test_recovery_never_leaves_job_status_silently_stuck(self, isolated_engine, monkeypatch):
        engine, repository, root, created = isolated_engine
        job = _create(engine)
        _add_artifact(
            engine, job, root, "backend/app/application/services/auth_service.py",
            'SECRET_KEY = "Xk9#mP2$vQ7nZ4wR8tY1uL5cB3sA6dF0"\n',
        )
        monkeypatch.setattr(
            "app.engines.generation_job_engine.generation_validation_engine.validate",
            lambda *a, **k: _passing_validation(),
        )
        with pytest.raises(StageFailure):
            engine._build(job, "user-1")
        # StageFailure propagates to run()'s handler in the real pipeline,
        # which sets NEEDS_USER_ACTION -- here at the _build() unit level we
        # only assert the diagnostic is rich enough to drive that (not the
        # bare original exception text).
        assert "recovery" in str(job.get("error", {}).get("message", "")).lower() or "WAITING_REPAIR_APPROVAL" in Path(
            next(a for a in job["artifacts"] if a["kind"] == "recovery_run")["path"]
        ).read_text(encoding="utf-8")
