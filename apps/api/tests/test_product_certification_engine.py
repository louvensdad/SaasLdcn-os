from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from app.engines import product_certification_engine as pce_module
from app.engines.generation_job_engine import GenerationJobEngine
from app.engines.product_certification_engine import ProductCertificationEngine
from app.schemas.functional_completeness import FunctionalCompletenessReport
from app.schemas.functional_coverage import ApplicationFunctionalCoverage, FunctionalCoverageFinding, FunctionalCoverageReport
from app.schemas.quality_gate import QualityGateReport
from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter

# ProductCertificationEngine calls quality_gate_engine.evaluate() internally,
# which needs a real project directory -- but a bare/minimal project ALWAYS
# has real BLOCKERs (missing backend manifest, .env.example, etc., same
# finding test_engineering_kernel_engine.py's own bare-project test already
# relies on). Isolating THIS engine's own precedence logic from that unrelated
# question means stubbing quality_gate_engine.evaluate(), same pattern
# test_engineering_kernel_engine.py's test_no_signals_and_no_blockers_is_partially_verified
# already uses.


@pytest.fixture
def make_project():
    created: list[Path] = []
    writer = ProjectWriter()

    def _make(files: list[tuple[str, str]] | None = None, name: str = "cert-test") -> dict:
        files = files or [("README.md", "# test\n")]
        result = writer.write(
            [EmittedFile(path=path, content=content) for path, content in files], project_name=name,
        )
        created.append(Path(result.root_path))
        return {"project_id": result.project_id, "generated_project_path": result.root_path}

    yield _make
    for root in created:
        shutil.rmtree(root, ignore_errors=True)


def _quality_report(project_id: str, *, blocker_count: int = 0) -> QualityGateReport:
    return QualityGateReport(
        project_id=project_id, passed=blocker_count == 0, can_release=blocker_count == 0,
        score=100 if blocker_count == 0 else 60, built=False, blocker_count=blocker_count,
        generated_at="2026-01-01T00:00:00+00:00",
    )


def _completeness(project_id: str, *, status: str, build_skipped: bool = False) -> FunctionalCompletenessReport:
    return FunctionalCompletenessReport(
        project_id=project_id, status=status, build_skipped=build_skipped,
        backend_completeness=100, frontend_completeness=100, build_completeness=0 if build_skipped else 100,
        generated_at="2026-01-01T00:00:00+00:00",
    )


def _coverage(project_id: str, *, blocking: bool = False) -> FunctionalCoverageReport:
    findings = [
        FunctionalCoverageFinding(id="f1", category="empty_handler", confidence="confirmed_error", detail="x")
    ] if blocking else []
    return FunctionalCoverageReport(
        project_id=project_id,
        frontend=ApplicationFunctionalCoverage(application="frontend", score=0 if blocking else 100, findings=findings, blocking=blocking),
        generated_at="2026-01-01T00:00:00+00:00",
    )


def test_needs_human_review_takes_precedence_over_everything(make_project, monkeypatch):
    project = make_project()
    monkeypatch.setattr(pce_module.quality_gate_engine, "evaluate", lambda *a, **k: _quality_report(project["project_id"]))
    completeness = _completeness(project["project_id"], status="NEEDS_HUMAN_REVIEW")
    report = ProductCertificationEngine().evaluate(project, completeness, _coverage(project["project_id"]))
    assert report.status == "NEEDS_HUMAN_REVIEW"


def test_blocked_status_carries_through(make_project, monkeypatch):
    project = make_project()
    monkeypatch.setattr(pce_module.quality_gate_engine, "evaluate", lambda *a, **k: _quality_report(project["project_id"]))
    completeness = _completeness(project["project_id"], status="BLOCKED")
    report = ProductCertificationEngine().evaluate(project, completeness, _coverage(project["project_id"]))
    assert report.status == "BLOCKED"
    assert report.architecture == 0


def test_build_skipped_is_failed_certification_even_with_clean_coverage(make_project, monkeypatch):
    project = make_project()
    monkeypatch.setattr(pce_module.quality_gate_engine, "evaluate", lambda *a, **k: _quality_report(project["project_id"]))
    completeness = _completeness(project["project_id"], status="PARTIALLY_VERIFIED", build_skipped=True)
    report = ProductCertificationEngine().evaluate(project, completeness, _coverage(project["project_id"]))
    assert report.status == "FAILED_CERTIFICATION"
    assert report.build == 0


def test_functional_coverage_blocking_is_needs_repair(make_project, monkeypatch):
    project = make_project()
    monkeypatch.setattr(pce_module.quality_gate_engine, "evaluate", lambda *a, **k: _quality_report(project["project_id"]))
    completeness = _completeness(project["project_id"], status="VERIFIED")
    report = ProductCertificationEngine().evaluate(project, completeness, _coverage(project["project_id"], blocking=True))
    assert report.status == "NEEDS_REPAIR"
    assert report.functional_coverage_blocking is True
    assert "Functional Coverage" in report.reason


def test_quality_gate_blocker_is_needs_repair(make_project, monkeypatch):
    project = make_project()
    monkeypatch.setattr(pce_module.quality_gate_engine, "evaluate", lambda *a, **k: _quality_report(project["project_id"], blocker_count=2))
    completeness = _completeness(project["project_id"], status="VERIFIED")
    report = ProductCertificationEngine().evaluate(project, completeness, _coverage(project["project_id"]))
    assert report.status == "NEEDS_REPAIR"
    assert report.quality_gate_blocker_count == 2


def test_partially_verified_with_no_blockers_is_partially_certified(make_project, monkeypatch):
    project = make_project()
    monkeypatch.setattr(pce_module.quality_gate_engine, "evaluate", lambda *a, **k: _quality_report(project["project_id"]))
    completeness = _completeness(project["project_id"], status="PARTIALLY_VERIFIED")
    report = ProductCertificationEngine().evaluate(project, completeness, _coverage(project["project_id"]))
    assert report.status == "PARTIALLY_CERTIFIED"


def test_verified_with_no_blockers_is_certified(make_project, monkeypatch):
    project = make_project()
    monkeypatch.setattr(pce_module.quality_gate_engine, "evaluate", lambda *a, **k: _quality_report(project["project_id"]))
    completeness = _completeness(project["project_id"], status="VERIFIED")
    report = ProductCertificationEngine().evaluate(project, completeness, _coverage(project["project_id"]))
    assert report.status == "CERTIFIED"
    assert report.overall > 0


def test_overall_is_the_mean_of_present_category_scores(make_project, monkeypatch):
    project = make_project()
    monkeypatch.setattr(pce_module.quality_gate_engine, "evaluate", lambda *a, **k: _quality_report(project["project_id"]))
    completeness = _completeness(project["project_id"], status="VERIFIED")
    completeness.mobile_completeness = None  # honestly absent (no mobile delivery)
    report = ProductCertificationEngine().evaluate(project, completeness, _coverage(project["project_id"]))
    assert report.mobile is None
    assert 0 < report.overall <= 100


def test_functional_coverage_json_is_written_alongside_the_other_reports(make_project):
    project = make_project([("README.md", "# test\n"), ("package.json", "{\"name\": \"web\"}")], name="wiring-cert-test")
    job_engine = GenerationJobEngine()
    job = {
        "id": "job-cert-wiring", "generatedProjectId": project["project_id"],
        "resultPath": project["generated_project_path"], "logs": [],
    }
    job_engine._evaluate_functional_completeness(job, "owner-1", build_skipped=False)

    root = Path(project["generated_project_path"])
    for name in ("product-completion-report.json", "functional-coverage.json", "product-certification.json"):
        assert (root / name).is_file(), name

    data = json.loads((root / "product-certification.json").read_text(encoding="utf-8"))
    assert data["project_id"] == project["project_id"]
    assert data["status"] in {
        "CERTIFIED", "PARTIALLY_CERTIFIED", "NEEDS_REPAIR", "BLOCKED", "FAILED_CERTIFICATION", "NEEDS_HUMAN_REVIEW",
    }
    assert job["productCertificationStatus"] == data["status"]
