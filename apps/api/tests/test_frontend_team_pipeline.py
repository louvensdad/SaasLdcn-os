from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

import pytest

from app.core.database import Base, database_url_for, get_engine, session_factory
import app.models  # noqa: F401
from app.engines.agent_prompts import AGENT_PROMPTS, system_prompt_for
from app.engines.generation_job_engine import GenerationJobEngine
from app.engines.generation_pipeline_policy import (
    FRONTEND_TEAM_CHUNKS,
    FRONTEND_TEAM_JSON_CHUNKS,
    FRONTEND_TEAM_ROLES,
    STEPS,
    PipelineStep,
)
from app.models.tenant import WorkspaceMembership
from app.repositories.generation_job_repository import GenerationJobRepository
from app.schemas.orchestrator import ProjectSpec

# PARTE 6 of the request: frontend generation was previously one single LLM
# call; these tests confirm the new 6-role Frontend Team pipeline is wired
# correctly end to end at every layer that had to change: pipeline steps,
# prompt registration, context-budget tables, and the context-injection
# helpers that make later roles actually see earlier roles' real output.


class TestFrontendTeamPipelineSteps:
    def test_frontend_generating_expands_to_six_chunks_in_order(self):
        frontend_generating = [s for s in STEPS if s.state == "FRONTEND_GENERATING"]
        assert [s.chunk for s in frontend_generating] == list(FRONTEND_TEAM_CHUNKS)
        assert [s.chunk for s in frontend_generating] == [
            "ux_strategy", "visual_direction", "frontend_architecture",
            "interaction_design", "implementation", "qa_review",
        ]

    def test_each_chunk_maps_to_a_distinct_role_except_implementation(self):
        frontend_generating = [s for s in STEPS if s.state == "FRONTEND_GENERATING"]
        roles = [s.role for s in frontend_generating]
        assert roles == [
            "frontend_ux_strategy", "frontend_visual_direction", "frontend_architecture_role",
            "frontend_interaction_design", "frontend", "frontend_qa_review",
        ]
        # implementation intentionally reuses the pre-existing "frontend" role
        # (and its prompt) unchanged -- only enriched via injected context.
        assert roles[4] == "frontend"

    def test_planning_and_review_chunks_are_json_only(self):
        assert FRONTEND_TEAM_JSON_CHUNKS == {
            "ux_strategy", "visual_direction", "frontend_architecture", "interaction_design", "qa_review",
        }
        assert "implementation" not in FRONTEND_TEAM_JSON_CHUNKS

    def test_frontend_planning_and_validating_still_bracket_the_team(self):
        logical_frontend = [s for s in STEPS if s.logical == "frontend"]
        assert logical_frontend[0].state == "FRONTEND_PLANNING"
        assert logical_frontend[-1].state == "FRONTEND_VALIDATING"
        assert len(logical_frontend) == 8  # planning + 6 chunks + validating


class TestFrontendTeamPrompts:
    @pytest.mark.parametrize("chunk,role", list(FRONTEND_TEAM_ROLES.items()))
    def test_every_frontend_team_role_resolves_to_a_real_prompt(self, chunk: str, role: str):
        prompt = system_prompt_for(role)
        assert prompt
        assert role in AGENT_PROMPTS

    def test_planning_role_prompts_specify_their_own_json_filename(self):
        assert 'path="ux-strategy.json"' in AGENT_PROMPTS["frontend_ux_strategy"]
        assert 'path="visual-direction.json"' in AGENT_PROMPTS["frontend_visual_direction"]
        assert 'path="frontend-architecture.json"' in AGENT_PROMPTS["frontend_architecture_role"]
        assert 'path="interaction-spec.json"' in AGENT_PROMPTS["frontend_interaction_design"]
        assert 'path="frontend-qa-review.json"' in AGENT_PROMPTS["frontend_qa_review"]

    def test_visual_direction_prompt_forbids_generic_patterns_by_default(self):
        prompt = AGENT_PROMPTS["frontend_visual_direction"]
        assert "gradiente roxo generico" in prompt
        assert "template de landing page" in prompt

    def test_qa_review_prompt_asks_the_ten_parte_7_questions(self):
        prompt = AGENT_PROMPTS["frontend_qa_review"]
        for marker in ("dominio informado", "identidade visual propria", "handler funcional real", "lorem ipsum"):
            assert marker in prompt

    def test_implementation_prompt_instructs_following_prior_team_artifacts(self):
        prompt = AGENT_PROMPTS["frontend"]
        assert "<ux_strategy>" in prompt
        assert "<visual_direction>" in prompt
        assert "<frontend_architecture>" in prompt
        assert "<interaction_spec>" in prompt


@pytest.fixture
def isolated_engine():
    root = Path(tempfile.mkdtemp(prefix="ldcn-frontend-team-"))
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


def _create(engine: GenerationJobEngine) -> dict:
    return engine.create_job(
        owner_user_id="user-1", project_id="room-1", workspace_id="enterprise",
        project_name="Orders", spec=_spec(), blueprint={"decisions": []},
        blueprint_version=1, provider="anthropic", provider_label="Claude", model="claude-sonnet-4",
    )


def _step(chunk: str, role: str) -> PipelineStep:
    return PipelineStep("FRONTEND_GENERATING", "frontend", "llm", role, chunk)


class TestFrontendTeamContextInjection:
    def test_no_prior_artifacts_yields_empty_context(self, isolated_engine):
        engine, _, _ = isolated_engine
        job = _create(engine)
        assert engine._frontend_team_context(job, "implementation") == ""

    def test_implementation_sees_all_four_planning_artifacts(self, isolated_engine):
        engine, _, _ = isolated_engine
        job = _create(engine)
        engine._write_text_artifact(job, "user-1", _step("ux_strategy", "frontend_ux_strategy"), "ux-strategy.json", '{"personas": []}', "generated", valid=True)
        engine._write_text_artifact(job, "user-1", _step("visual_direction", "frontend_visual_direction"), "visual-direction.json", '{"concept": "warm"}', "generated", valid=True)
        engine._write_text_artifact(job, "user-1", _step("frontend_architecture", "frontend_architecture_role"), "frontend-architecture.json", '{"routes": []}', "generated", valid=True)
        engine._write_text_artifact(job, "user-1", _step("interaction_design", "frontend_interaction_design"), "interaction-spec.json", '{"loading_states": []}', "generated", valid=True)

        context = engine._frontend_team_context(job, "implementation")
        assert "<ux_strategy>" in context and '"personas": []' in context
        assert "<visual_direction>" in context and '"concept": "warm"' in context
        assert "<frontend_architecture>" in context and '"routes": []' in context
        assert "<interaction_spec>" in context and '"loading_states": []' in context
        assert "<generated_frontend_sample>" not in context  # only qa_review gets the code sample

    def test_qa_review_additionally_sees_real_generated_code(self, isolated_engine):
        engine, _, _ = isolated_engine
        job = _create(engine)
        engine._write_text_artifact(
            job, "user-1", _step("implementation", "frontend"), "app/orders/page.tsx",
            "export default function OrdersPage() { return <div>Orders</div>; }", "generated", valid=True,
        )
        context = engine._frontend_team_context(job, "qa_review")
        assert "<generated_frontend_sample>" in context
        assert "app/orders/page.tsx" in context
        assert "OrdersPage" in context

    def test_generated_sample_is_bounded_by_max_files_and_chars(self, isolated_engine):
        engine, _, _ = isolated_engine
        job = _create(engine)
        for i in range(15):
            engine._write_text_artifact(
                job, "user-1", _step("implementation", "frontend"), f"app/page{i}.tsx",
                "x" * 5000, "generated", valid=True,
            )
        sample = engine._frontend_generated_sample(job, max_files=3, max_chars=100)
        assert sample.count("<<<FILE") == 3
        # each snippet capped well below the full 5000-char file
        assert all(len(part) < 500 for part in sample.split("<<<FILE")[1:])

    def test_implementation_chunk_files_never_pollute_qa_review_sample_with_planning_json(self, isolated_engine):
        engine, _, _ = isolated_engine
        job = _create(engine)
        engine._write_text_artifact(job, "user-1", _step("ux_strategy", "frontend_ux_strategy"), "ux-strategy.json", "{}", "generated", valid=True)
        engine._write_text_artifact(job, "user-1", _step("implementation", "frontend"), "app/page.tsx", "real code", "generated", valid=True)
        sample = engine._frontend_generated_sample(job)
        assert "ux-strategy.json" not in sample
        assert "app/page.tsx" in sample
