from __future__ import annotations

import shutil

import pytest
from fastapi import HTTPException

import app.engines.verification_engine as veng
from app.routes.meta_factory import _meta_project, _require_verified
from app.schemas.generation_validation import (
    BuildValidationReport,
    DependencyAuditReport,
    GenerationValidationReport,
)
from app.schemas.llm import LLMResponse, Provider
from app.schemas.orchestrator import ProjectSpec, SuggestedStack
from app.services.file_protocol import EmittedFile
from app.services.project_writer import DEFAULT_OUTPUT_ROOT, ProjectWriter


def _spec() -> ProjectSpec:
    return ProjectSpec(raw_intent="x", product_summary="Demo app", suggested_stack=SuggestedStack())


def _report(project_id: str, *, passed: bool) -> GenerationValidationReport:
    return GenerationValidationReport(
        project_id=project_id,
        score=100 if passed else 40,
        passed=passed,
        quality={"missing_files": [] if passed else ["tsconfig.json"], "checks": []},
        security_findings=[],
        dependency_audit=DependencyAuditReport(status="passed", findings=[]),
        build=BuildValidationReport(
            installed="passed",
            built="passed" if passed else "failed",
            ok=passed,
            logs_tail="" if passed else "error TS2307: Cannot find module './tsconfig'",
        ),
        warnings=[],
    )


class _RepairRouter:
    """Repair agent stub that emits the missing file."""

    def route(self, req, **kwargs):
        text = '<<<FILE path="tsconfig.json">>>\n{}\n<<<END>>>'
        return LLMResponse(provider=Provider.anthropic, model="claude-opus-4-8", text=text)


@pytest.fixture
def project():
    # Projects must live under the real output root (inside the workspace) so the
    # generated-project services accept the path.
    result = ProjectWriter().write([EmittedFile(path="package.json", content='{"name":"x"}')], project_name="verifytest")
    try:
        yield _meta_project(result.project_id), result.project_id
    finally:
        shutil.rmtree(DEFAULT_OUTPUT_ROOT / result.project_id, ignore_errors=True)


def test_verify_repairs_then_passes(project, monkeypatch):
    proj, project_id = project
    calls = {"n": 0}

    def fake_validate(_proj):
        calls["n"] += 1
        return _report(project_id, passed=calls["n"] >= 2)  # fail first, pass after repair

    monkeypatch.setattr(veng.generation_validation_engine, "validate", fake_validate)

    events = list(veng.iter_verification(proj, _spec(), router=_RepairRouter(), max_rounds=2))
    types = [e["type"] for e in events]
    assert "repair_started" in types and "repair_finished" in types
    assert types[-1] == "verify_done"
    assert events[-1]["passed"] is True
    assert calls["n"] == 2  # validated, repaired, re-validated -> passed
    assert ProjectWriter().read_verification(project_id)["verified"] is True


def test_verify_gives_up_after_max_rounds(project, monkeypatch):
    proj, project_id = project
    monkeypatch.setattr(veng.generation_validation_engine, "validate", lambda _p: _report(project_id, passed=False))

    events = list(veng.iter_verification(proj, _spec(), router=_RepairRouter(), max_rounds=2))
    assert events[-1]["type"] == "verify_done"
    assert events[-1]["passed"] is False
    assert [e["type"] for e in events].count("repair_started") == 2  # exhausted both rounds
    assert ProjectWriter().read_verification(project_id)["verified"] is False


def test_release_gate_blocks_unverified_allows_force_and_verified(project):
    _proj, project_id = project

    # Unverified -> blocked.
    with pytest.raises(HTTPException) as exc:
        _require_verified(project_id, force=False)
    assert exc.value.status_code == 409

    # Override bypasses the gate.
    _require_verified(project_id, force=True)  # no raise

    # Once verified, the gate opens.
    ProjectWriter().set_verification(project_id, verified=True, score=100)
    _require_verified(project_id, force=False)  # no raise
