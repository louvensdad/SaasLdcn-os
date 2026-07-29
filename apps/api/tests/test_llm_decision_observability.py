from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from app.core.config import get_settings
from app.data.model_registry import resolve_model, resolve_model_detailed
from app.repositories.llm_decision_trace_repository import LlmDecisionTraceRepository
from app.repositories.project_room_repository import ProjectRoomRepository
from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter


def _repo() -> LlmDecisionTraceRepository:
    return LlmDecisionTraceRepository(get_settings().sqlite_path)


# --------------------------------------------------------------- resolve_model_detailed

def test_user_choice_wins_and_reports_real_losing_alternatives():
    resolution = resolve_model_detailed(
        user_choice="claude-haiku-4-5", agent_role="backend", model_strategy="economy",
    )
    assert resolution.model == "claude-haiku-4-5"
    assert resolution.policy == "user_choice"
    # backend/economy really does resolve to sonnet, and role_hint really is opus --
    # both are genuine losing candidates, not fabricated.
    assert {"policy": "profile_override", "model": "claude-sonnet-4-6"} in resolution.alternatives
    assert {"policy": "role_hint", "model": "claude-opus-4-8"} in resolution.alternatives


def test_profile_override_wins_over_role_hint_and_default():
    resolution = resolve_model_detailed(agent_role="backend", model_strategy="economy")
    assert resolution.model == "claude-sonnet-4-6"
    assert resolution.policy == "profile_override"
    assert {"policy": "role_hint", "model": "claude-opus-4-8"} in resolution.alternatives


def test_role_hint_wins_with_no_profile():
    resolution = resolve_model_detailed(agent_role="docs")
    assert resolution.model == "claude-haiku-4-5"
    assert resolution.policy == "role_hint"
    assert resolution.alternatives == [{"policy": "default", "model": "claude-opus-4-8"}]


def test_default_wins_with_nothing_else():
    resolution = resolve_model_detailed()
    assert resolution.model == "claude-opus-4-8"
    assert resolution.policy == "default"
    assert resolution.alternatives == []


def test_resolve_model_wrapper_still_matches_detailed():
    assert resolve_model(agent_role="backend", model_strategy="economy") == resolve_model_detailed(
        agent_role="backend", model_strategy="economy"
    ).model


# --------------------------------------------------------------- router integration

def test_router_records_a_decision_trace_on_every_response(client):
    from app.engines.llm.router import LLMRouter
    from app.schemas.llm import LLMRequest

    router = LLMRouter()
    settings = get_settings()
    previous = settings.force_mock
    settings.force_mock = True
    try:
        router.route(
            LLMRequest(system="s", user="u"),
            agent_role="backend",
            model_strategy="economy",
            project_id="proj_trace_test",
            context_used=["project_memory"],
        )
    finally:
        settings.force_mock = previous

    rows = _repo().list_for_project("proj_trace_test")
    assert len(rows) == 1
    row = rows[0]
    assert row["agent_role"] == "backend"
    assert row["selection_policy"] == "profile_override"
    assert {"policy": "role_hint", "model": "claude-opus-4-8"} in row["alternatives"]
    assert row["context_used"] == ["project_memory"]
    assert row["project_id"] == "proj_trace_test"
    # No confidence field is ever produced -- honest omission, not a fabricated number.
    assert "confidence" not in row


def test_call_without_project_id_never_breaks_and_leaves_no_attribution(client):
    """Fault-isolated, same guarantee as record_usage_safely: a call with no
    project context still completes and simply isn't attributable to any
    project -- an honest gap, not a crash."""
    from app.engines.llm.router import LLMRouter
    from app.models.llm_decision_trace import LlmDecisionTrace
    from app.schemas.llm import LLMRequest
    from sqlalchemy import select

    router = LLMRouter()
    settings = get_settings()
    previous = settings.force_mock
    settings.force_mock = True
    try:
        response = router.route(LLMRequest(system="s", user="u"))
    finally:
        settings.force_mock = previous
    assert response.text

    repo = _repo()
    with repo._sessions() as session:  # noqa: SLF001 -- test-only introspection
        rows = session.scalars(select(LlmDecisionTrace).where(LlmDecisionTrace.project_id.is_(None))).all()
    assert any(row.model == response.model for row in rows)


# --------------------------------------------------------------- observability route

@pytest.fixture
def make_project():
    created: list[Path] = []
    writer = ProjectWriter()

    def _make(owner: str | None = None) -> str:
        result = writer.write(
            [EmittedFile(path="README.md", content="# x")],
            project_name="decision-trace-test", owner=owner,
        )
        created.append(Path(result.root_path))
        return result.project_id

    yield _make
    for root in created:
        shutil.rmtree(root, ignore_errors=True)


def test_list_decisions_requires_project_id_query_param(client):
    response = client.get("/api/observability/decisions")
    assert response.status_code == 422


def test_list_decisions_404_for_unknown_project(client):
    response = client.get("/api/observability/decisions", params={"project_id": "does-not-exist"})
    assert response.status_code == 404


def test_list_decisions_returns_rows_for_owned_project(client, make_project):
    user_id = client.get("/api/auth/me").json()["user_id"]
    project_id = make_project(owner=user_id)
    _repo().record(
        provider="anthropic", model="claude-opus-4-8", agent_role="backend", model_strategy=None,
        selection_policy="default", alternatives=[], context_used=None, project_id=project_id,
        usage={"input": 100, "output": 50}, latency_ms=10,
    )

    response = client.get("/api/observability/decisions", params={"project_id": project_id})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["project_id"] == project_id
    assert body[0]["selection_policy"] == "default"


def test_list_decisions_404_for_a_different_owners_project(client, make_project):
    project_id = make_project(owner="someone-else")
    response = client.get("/api/observability/decisions", params={"project_id": project_id})
    assert response.status_code == 404


def test_get_single_decision_trace_404_when_not_owned(client, make_project):
    project_id = make_project(owner="someone-else")
    _repo().record(
        provider="anthropic", model="claude-opus-4-8", agent_role=None, model_strategy=None,
        selection_policy="default", alternatives=[], context_used=None, project_id=project_id,
        usage={}, latency_ms=1,
    )
    trace_id = _repo().list_for_project(project_id)[0]["id"]

    response = client.get(f"/api/observability/decisions/{trace_id}")
    assert response.status_code == 404


def test_get_single_decision_trace_for_owner(client, make_project):
    user_id = client.get("/api/auth/me").json()["user_id"]
    project_id = make_project(owner=user_id)
    _repo().record(
        provider="anthropic", model="claude-opus-4-8", agent_role="reviewer", model_strategy=None,
        selection_policy="role_hint", alternatives=[{"policy": "default", "model": "claude-opus-4-8"}],
        context_used=None, project_id=project_id, usage={"input": 10, "output": 5}, latency_ms=3,
    )
    trace_id = _repo().list_for_project(project_id)[0]["id"]

    response = client.get(f"/api/observability/decisions/{trace_id}")
    assert response.status_code == 200
    assert response.json()["agent_role"] == "reviewer"
