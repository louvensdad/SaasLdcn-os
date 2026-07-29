from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from app.engines.product_certification_engine import product_certification_engine
from app.schemas.authenticity import AuthenticityFinding, AuthenticityReport
from app.schemas.functional_completeness import FunctionalCompletenessReport
from app.schemas.functional_coverage import FunctionalCoverageReport
from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter

# Confirms PARTE 7's authenticity dimension actually moves the final
# certification verdict, not just an isolated score sitting unused next to
# the others -- same real-project-on-disk fixture pattern as
# test_quality_gate_auto_repair.py's make_project (QualityGateEngine enforces
# projects live inside the real workspace root).


@pytest.fixture
def make_project():
    created: list[Path] = []
    writer = ProjectWriter()

    def _make(files: list[tuple[str, str]], name: str = "cert-authenticity-test") -> dict:
        result = writer.write([EmittedFile(path=p, content=c) for p, c in files], project_name=name)
        created.append(Path(result.root_path))
        return {"project_id": result.project_id, "project_name": name, "generated_project_path": result.root_path}

    yield _make
    for root in created:
        shutil.rmtree(root, ignore_errors=True)


def _completeness(project_id: str) -> FunctionalCompletenessReport:
    return FunctionalCompletenessReport(
        project_id=project_id, status="VERIFIED", backend_completeness=100, build_completeness=100,
        generated_at="2026-01-01T00:00:00+00:00",
    )


def _coverage(project_id: str) -> FunctionalCoverageReport:
    return FunctionalCoverageReport(project_id=project_id, generated_at="2026-01-01T00:00:00+00:00")


class TestAuthenticityAffectsCertification:
    def test_no_authenticity_report_leaves_status_unaffected(self, make_project):
        project = make_project([("README.md", "# Test\n")])
        report = product_certification_engine.evaluate(project, _completeness(project["project_id"]), _coverage(project["project_id"]), None)
        assert report.authenticity is None
        assert report.authenticity_blocking is False

    def test_clean_authenticity_report_does_not_block(self, make_project):
        project = make_project([("README.md", "# Test\n")])
        clean = AuthenticityReport(project_id=project["project_id"], score=100, findings=[], blocking=False, generated_at="2026-01-01T00:00:00+00:00")
        report = product_certification_engine.evaluate(project, _completeness(project["project_id"]), _coverage(project["project_id"]), clean)
        assert report.authenticity == 100
        assert report.authenticity_blocking is False
        # Other unrelated Quality Gate findings on this minimal fixture (e.g.
        # missing manifests) may still push status to NEEDS_REPAIR -- what
        # matters here is authenticity itself contributes no blocking reason.
        assert "Authenticity" not in report.reason

    def test_blocking_authenticity_finding_downgrades_status_to_needs_repair(self, make_project):
        project = make_project([("README.md", "# Test\n")])
        bad = AuthenticityReport(
            project_id=project["project_id"], score=60,
            findings=[AuthenticityFinding(
                id="lorem_ipsum:app/page.tsx:0", category="lorem_ipsum", confidence="confirmed_error",
                file="app/page.tsx", detail="Contains literal 'Lorem ipsum' placeholder text.",
                evidence=["'lorem ipsum' found in generated content"],
            )],
            blocking=True, generated_at="2026-01-01T00:00:00+00:00",
        )
        report = product_certification_engine.evaluate(project, _completeness(project["project_id"]), _coverage(project["project_id"]), bad)
        assert report.authenticity == 60
        assert report.authenticity_blocking is True
        assert report.status == "NEEDS_REPAIR"
        assert "Authenticity" in report.reason

    def test_authenticity_score_factors_into_overall(self, make_project):
        project = make_project([("README.md", "# Test\n")])
        low_score_non_blocking = AuthenticityReport(
            project_id=project["project_id"], score=40,
            findings=[AuthenticityFinding(
                id="generic_placeholder_image:app/page.tsx:0", category="generic_placeholder_image",
                confidence="high_confidence", file="app/page.tsx", detail="uses picsum.photos",
                evidence=["known placeholder-image domain matched"],
            )],
            blocking=False, generated_at="2026-01-01T00:00:00+00:00",
        )
        with_auth = product_certification_engine.evaluate(project, _completeness(project["project_id"]), _coverage(project["project_id"]), low_score_non_blocking)
        without_auth = product_certification_engine.evaluate(project, _completeness(project["project_id"]), _coverage(project["project_id"]), None)
        assert with_auth.overall < without_auth.overall
