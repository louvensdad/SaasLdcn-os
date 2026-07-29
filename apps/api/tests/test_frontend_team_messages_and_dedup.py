from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from app.core.database import Base, database_url_for, get_engine, session_factory
import app.models  # noqa: F401
from app.engines.generation_job_engine import GenerationJobEngine
from app.engines.generation_pipeline_policy import FRONTEND_TEAM_CHUNKS, FRONTEND_TEAM_START_MESSAGES, PipelineStep
from app.engines.product_certification_engine import product_certification_engine
from app.engines.quality_gate_engine import QualityGateEngine
from app.models.tenant import WorkspaceMembership
from app.repositories.generation_job_repository import GenerationJobRepository
from app.schemas.authenticity import AuthenticityReport
from app.schemas.functional_completeness import FunctionalCompletenessReport
from app.schemas.functional_coverage import FunctionalCoverageReport
from app.schemas.orchestrator import ProjectSpec
from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter


class TestFrontendTeamFriendlyMessages:
    def test_every_frontend_team_chunk_has_a_real_message(self):
        for chunk in FRONTEND_TEAM_CHUNKS:
            assert chunk in FRONTEND_TEAM_START_MESSAGES
            assert FRONTEND_TEAM_START_MESSAGES[chunk].strip()

    def test_messages_are_specific_not_generic(self):
        # Each message must actually be distinguishable -- no copy-paste reuse.
        messages = list(FRONTEND_TEAM_START_MESSAGES.values())
        assert len(messages) == len(set(messages))


@pytest.fixture
def isolated_engine():
    root = Path(tempfile.mkdtemp(prefix="ldcn-frontend-messages-"))
    database_path = root / "jobs.db"
    database_url = database_url_for(database_path)
    Base.metadata.create_all(bind=get_engine(database_url))
    with session_factory(database_url).begin() as session:
        session.add(WorkspaceMembership(workspace_id="enterprise", user_id="user-1", role="owner", created_at="2026-01-01T00:00:00+00:00"))
    repository = GenerationJobRepository(database_path)
    engine = GenerationJobEngine(repository, root / "checkpoints")
    try:
        yield engine, repository, root
    finally:
        get_engine(database_url).dispose()
        shutil.rmtree(root, ignore_errors=True)


def _spec() -> ProjectSpec:
    return ProjectSpec(
        raw_intent="Sistema de pedidos", product_summary="Gestao de pedidos",
        entities=["Order"], business_rules=["Somente operadores aprovam"], core_workflows=["Criar pedido"],
    )


class TestBeginStepEmitsRealFriendlyMessage:
    def test_ux_strategy_step_emits_its_specific_message(self, isolated_engine):
        engine, _, _ = isolated_engine
        job = engine.create_job(
            owner_user_id="user-1", project_id="room-1", workspace_id="enterprise",
            project_name="Orders", spec=_spec(), blueprint={"decisions": []},
            blueprint_version=1, provider="anthropic", provider_label="Claude", model="claude-sonnet-4",
        )
        step = PipelineStep("FRONTEND_GENERATING", "frontend", "llm", "frontend_ux_strategy", "ux_strategy")
        engine._begin_step(job, "user-1", step, index=5, steps=[step])
        last_event = job["events"][-1]
        assert last_event["message"] == "Mapeando as jornadas principais."

    def test_non_frontend_team_step_keeps_the_generic_message(self, isolated_engine):
        engine, _, _ = isolated_engine
        job = engine.create_job(
            owner_user_id="user-1", project_id="room-1", workspace_id="enterprise",
            project_name="Orders", spec=_spec(), blueprint={"decisions": []},
            blueprint_version=1, provider="anthropic", provider_label="Claude", model="claude-sonnet-4",
        )
        step = PipelineStep("BACKEND_GENERATING", "backend", "llm", "backend", "domain_entities")
        engine._begin_step(job, "user-1", step, index=5, steps=[step])
        last_event = job["events"][-1]
        assert "Etapa iniciada: backend.domain_entities." == last_event["message"]


@pytest.fixture
def make_project():
    created: list[Path] = []
    writer = ProjectWriter()

    def _make(files: list[tuple[str, str]], name: str = "dedup-test") -> dict:
        result = writer.write([EmittedFile(path=p, content=c) for p, c in files], project_name=name)
        created.append(Path(result.root_path))
        return {"project_id": result.project_id, "project_name": name, "generated_project_path": result.root_path}

    yield _make
    for root in created:
        shutil.rmtree(root, ignore_errors=True)


class TestAuthenticityDeduplication:
    def test_precomputed_authenticity_is_reused_not_recomputed(self, make_project):
        project = make_project([("README.md", "# Test\n")])
        precomputed = AuthenticityReport(
            project_id=project["project_id"], score=42, findings=[], blocking=False,
            generated_at="2026-01-01T00:00:00+00:00",
        )
        with patch("app.engines.quality_gate_engine.frontend_authenticity_gate.evaluate") as mock_evaluate:
            QualityGateEngine().evaluate(project, run_build=False, authenticity=precomputed)
            mock_evaluate.assert_not_called()

    def test_no_precomputed_authenticity_falls_back_to_computing_it(self, make_project):
        project = make_project([("README.md", "# Test\n")])
        with patch("app.engines.quality_gate_engine.frontend_authenticity_gate.evaluate") as mock_evaluate:
            mock_evaluate.return_value = AuthenticityReport(
                project_id=project["project_id"], score=100, findings=[], blocking=False,
                generated_at="2026-01-01T00:00:00+00:00",
            )
            QualityGateEngine().evaluate(project, run_build=False)
            mock_evaluate.assert_called_once()

    def test_product_certification_passes_its_authenticity_through_not_recomputed(self, make_project):
        project = make_project([("README.md", "# Test\n")])
        completeness = FunctionalCompletenessReport(
            project_id=project["project_id"], status="VERIFIED", backend_completeness=100,
            build_completeness=100, generated_at="2026-01-01T00:00:00+00:00",
        )
        coverage = FunctionalCoverageReport(project_id=project["project_id"], generated_at="2026-01-01T00:00:00+00:00")
        authenticity = AuthenticityReport(
            project_id=project["project_id"], score=77, findings=[], blocking=False,
            generated_at="2026-01-01T00:00:00+00:00",
        )
        with patch("app.engines.quality_gate_engine.frontend_authenticity_gate.evaluate") as mock_evaluate:
            report = product_certification_engine.evaluate(project, completeness, coverage, authenticity)
            mock_evaluate.assert_not_called()
        assert report.authenticity == 77
