from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

import pytest

from app.core.database import Base, database_url_for, get_engine, session_factory
import app.models  # noqa: F401
from app.engines.generation_job_engine import GenerationJobEngine
from app.engines.generation_pipeline_policy import PipelineStep
from app.models.tenant import WorkspaceMembership
from app.repositories.generation_job_repository import GenerationJobRepository
from app.schemas.orchestrator import ProjectSpec

# Real, evidence-based semantic merge check (PARTE 5 of the request), run at
# the exact point each chunk's parsed files get persisted -- before the
# Architecture Consolidation Gate ever sees them. Verified against a real
# historical job that a chunk-scoped path can nonetheless collide exactly
# with an earlier chunk's output; the check here is deliberately conservative
# (only rejects an EXACT path collision with different content from a
# DIFFERENT chunk -- never a heuristic guess) so it can never drop a
# legitimately different file.


@pytest.fixture
def isolated_engine():
    root = Path(tempfile.mkdtemp(prefix="ldcn-semantic-merge-"))
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
        raw_intent="Sistema de autenticacao", product_summary="Backend de autenticacao",
        entities=["User"], business_rules=["Somente usuarios autenticados"], core_workflows=["Login"],
    )


def _create(engine: GenerationJobEngine) -> dict:
    return engine.create_job(
        owner_user_id="user-1", project_id="room-1", workspace_id="enterprise",
        project_name="AuthService", spec=_spec(), blueprint={"decisions": []},
        blueprint_version=1, provider="anthropic", provider_label="Claude", model="claude-sonnet-4",
    )


def _step(chunk: str) -> PipelineStep:
    return PipelineStep("BACKEND_GENERATING", "backend", "llm", "backend", chunk)


class TestSemanticMergeDecision:
    def test_new_path_is_accepted(self, isolated_engine):
        engine, _, _ = isolated_engine
        job = _create(engine)
        kind, warnings = engine._semantic_merge_decision(job, _step("domain_entities"), "backend/app/domain/user.py", "class User: pass\n")
        assert kind == "generated"
        assert not any("rejected_duplicate" in w for w in warnings)

    def test_same_chunk_reemitting_same_path_is_accepted(self, isolated_engine):
        engine, _, _ = isolated_engine
        job = _create(engine)
        step = _step("domain_entities")
        engine._write_text_artifact(job, "user-1", step, "backend/app/domain/user.py", "class User: pass\n", "generated", valid=True)
        kind, warnings = engine._semantic_merge_decision(job, step, "backend/app/domain/user.py", "class User: id: int\n")
        assert kind == "generated", "a retry within the SAME chunk must be allowed to revise its own file"

    def test_different_chunk_identical_content_is_accepted(self, isolated_engine):
        engine, _, _ = isolated_engine
        job = _create(engine)
        engine._write_text_artifact(job, "user-1", _step("domain_entities"), "backend/app/domain/user.py", "class User: pass\n", "generated", valid=True)
        kind, warnings = engine._semantic_merge_decision(job, _step("services"), "backend/app/domain/user.py", "class User: pass\n")
        assert kind == "generated", "identical content is not a real conflict"

    def test_different_chunk_different_content_is_rejected(self, isolated_engine):
        engine, _, _ = isolated_engine
        job = _create(engine)
        engine._write_text_artifact(job, "user-1", _step("domain_entities"), "backend/app/domain/user.py", "class User: pass\n", "generated", valid=True)
        kind, warnings = engine._semantic_merge_decision(job, _step("services"), "backend/app/domain/user.py", "class User: id: int; email: str\n")
        assert kind == "generated_rejected_duplicate"
        assert any("semantic_merge_rejected_duplicate" in w for w in warnings)
        assert "backend.domain_entities" in warnings[0]

    def test_rejected_duplicate_never_reaches_the_final_build_file_set(self, isolated_engine, monkeypatch):
        from types import SimpleNamespace
        engine, repository, root = isolated_engine
        job = _create(engine)
        engine._write_text_artifact(job, "user-1", _step("domain_entities"), "backend/app/domain/user.py", "class User: pass\n", "generated", valid=True)
        kind, warnings = engine._semantic_merge_decision(job, _step("services"), "backend/app/domain/user.py", "class User: DIFFERENT\n")
        artifact = engine._write_text_artifact(job, "user-1", _step("services"), "backend/app/domain/user.py", "class User: DIFFERENT\n", kind, valid=(kind == "generated"), warnings=warnings)
        assert artifact["kind"] == "generated_rejected_duplicate"
        assert artifact["valid"] is False

        from app.schemas.generation_validation import BuildValidationReport, DependencyAuditReport, GenerationValidationReport
        fake_writer = SimpleNamespace(write=lambda files, **kwargs: SimpleNamespace(project_id="p1", root_path=root / "generated"))
        (root / "generated").mkdir(exist_ok=True)
        monkeypatch.setattr("app.engines.generation_job_engine.ProjectWriter", lambda: fake_writer)
        captured = {}

        def _capture_write(files, **kwargs):
            captured["files"] = files
            return SimpleNamespace(project_id="p1", root_path=root / "generated")
        fake_writer.write = _capture_write
        fake_writer.set_verification = lambda *a, **k: None
        monkeypatch.setattr(
            "app.engines.generation_job_engine.generation_validation_engine.validate",
            lambda *a, **k: GenerationValidationReport(
                project_id="p1", score=90, passed=True, quality={"checks": []},
                dependency_audit=DependencyAuditReport(status="passed"),
                build=BuildValidationReport(installed="passed", built="passed", ok=True, recovery_status=None),
            ),
        )
        engine._build(job, "user-1")
        paths = [f.path for f in captured["files"]]
        assert paths.count("backend/app/domain/user.py") == 1
        matching = next(f for f in captured["files"] if f.path == "backend/app/domain/user.py")
        assert matching.content == "class User: pass\n", "the FIRST (accepted) version must be the one that survives to build"

    def test_ownership_mismatch_is_observational_not_blocking(self, isolated_engine):
        engine, _, _ = isolated_engine
        job = _create(engine)
        # "structure" chunk emitting a full domain entity -- the real pattern
        # confirmed against genjob_3be298b1d64b42 -- must be flagged, not dropped.
        kind, warnings = engine._semantic_merge_decision(job, _step("structure"), "backend/app/domain/model/Usuario.java", "public class Usuario {}\n")
        assert kind == "generated"
        assert any("semantic_ownership_mismatch" in w for w in warnings)
        assert "domain_entities" in warnings[0]

    def test_matching_ownership_has_no_warning(self, isolated_engine):
        engine, _, _ = isolated_engine
        job = _create(engine)
        kind, warnings = engine._semantic_merge_decision(job, _step("domain_entities"), "backend/app/domain/model/Usuario.java", "public class Usuario {}\n")
        assert kind == "generated"
        assert warnings == []

    def test_non_backend_stage_is_never_flagged_for_ownership(self, isolated_engine):
        engine, _, _ = isolated_engine
        job = _create(engine)
        step = PipelineStep("FRONTEND_GENERATING", "frontend", "llm", "frontend")
        kind, warnings = engine._semantic_merge_decision(job, step, "src/app/page.tsx", "export default function Page() {}\n")
        assert kind == "generated"
        assert warnings == []
