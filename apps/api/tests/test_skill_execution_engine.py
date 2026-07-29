from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.engines.skill_execution_engine import SkillExecutionEngine


class _StubProjectService:
    def __init__(self, project: dict | None):
        self._project = project

    def get_project(self, project_id: str, user_id: str | None = None) -> dict | None:
        return self._project


def test_review_blueprint_on_a_project_without_a_blueprint_snapshot_returns_422():
    # A project that exists (passes ownership) but hasn't reached the blueprint
    # stage yet has blueprint_snapshot=None; review_blueprint used to index
    # straight into it and raise a bare, unhandled TypeError (500).
    engine = SkillExecutionEngine(project_service=_StubProjectService({"blueprint_snapshot": None}))

    with pytest.raises(HTTPException) as exc:
        engine.execute("review_blueprint", "project-1", {}, "user-1")

    assert exc.value.status_code == 422


def test_analyze_readiness_on_a_project_missing_technology_graph_returns_422():
    engine = SkillExecutionEngine(project_service=_StubProjectService({"blueprint_snapshot": {}}))

    with pytest.raises(HTTPException) as exc:
        engine.execute("analyze_readiness", "project-1", {}, "user-1")

    assert exc.value.status_code == 422


def test_review_blueprint_succeeds_on_a_fully_populated_project():
    project = {
        "blueprint_snapshot": {
            "validation": {"valid": True, "errors": [], "warnings": []},
            "capabilities": ["authentication"],
            "endpoints": ["auth.login"],
        }
    }
    engine = SkillExecutionEngine(project_service=_StubProjectService(project))

    result = engine.execute("review_blueprint", "project-1", {}, "user-1")

    assert result["status"] == "completed"
    assert result["outputs"]["valid"] is True
    assert result["outputs"]["capability_count"] == 1
