from __future__ import annotations

from app.registry.missions_registry import (
    MISSION_SUMMARIES,
    UnknownMissionTypeError,
    list_mission_summaries,
    resolve_mission_summary,
)
from app.services.mission_service import MissionError

WORKSPACE_MISSION_TYPES = {
    "software.build",
    "project.analyze",
    "automation.create",
    "error.diagnose",
    "system.modernize",
    "project.plan",
    "architecture.review",
    "documentation.create",
    "agent.create",
    "integration.create",
    "security.audit",
    "data.analyze",
    "performance.analyze",
    "build.fix",
    "security.fix",
    "performance.fix",
    "tech.migrate",
    "code.refactor",
    "system.scale",
    "sprint.plan",
    "infrastructure.plan",
    "tech.research",
    "solutions.compare",
    "feasibility.study",
}

VALID_CATEGORIES = {"create", "analyze", "fix", "evolve", "plan", "research"}


def test_registry_has_every_interactive_workspace_mission_type():
    assert set(MISSION_SUMMARIES) == WORKSPACE_MISSION_TYPES


def test_every_summary_has_a_valid_category_and_at_least_one_specialist():
    for summary in MISSION_SUMMARIES.values():
        assert summary.category in VALID_CATEGORIES
        assert len(summary.specialists) > 0


def test_resolve_mission_summary_raises_for_unknown_type():
    import pytest

    with pytest.raises(UnknownMissionTypeError):
        resolve_mission_summary("not.a.real.mission")


def test_list_mission_summaries_matches_registry():
    summaries = list_mission_summaries()
    assert {s.id for s in summaries} == WORKSPACE_MISSION_TYPES


def test_missions_registry_endpoint_returns_all_workspace_types(client):
    response = client.get("/api/missions/registry")

    assert response.status_code == 200
    payload = response.json()
    assert {item["id"] for item in payload} == WORKSPACE_MISSION_TYPES
    software_build = next(item for item in payload if item["id"] == "software.build")
    assert software_build["category"] == "create"
    assert "software_architect" in software_build["specialists"]


def test_mission_error_diagnostic_shape_matches_project_room_error():
    error = MissionError(
        "msg", current_status="active", expected_statuses=["active"],
        endpoint="/api/missions/x", reason="r", correction="c",
    )
    diagnostic = error.diagnostic()
    assert diagnostic["status_current"] == "active"
    assert diagnostic["endpoint_called"] == "/api/missions/x"
    assert diagnostic["rejection_reason"] == "r"
    assert diagnostic["correction"] == "c"
