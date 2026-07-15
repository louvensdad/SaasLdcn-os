from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.engines.quality_gate_engine import quality_gate_engine
from app.schemas.functional_completeness import FunctionalCompletenessReport
from app.schemas.functional_coverage import FunctionalCoverageReport
from app.schemas.product_certification import ProductCertificationReport, ProductCertificationStatus

# Product Certification Engine (Product Certification Engine P1, second slice):
# consolidates FunctionalCompletenessReport + FunctionalCoverageReport +
# QualityGateReport into one status and one flat score summary. Detects
# nothing new -- every input is already computed and already tested elsewhere;
# this only decides which of 6 states the combination adds up to.


class ProductCertificationEngine:
    def evaluate(
        self, project: dict[str, Any], completeness: FunctionalCompletenessReport,
        coverage: FunctionalCoverageReport,
    ) -> ProductCertificationReport:
        quality_report = quality_gate_engine.evaluate(project, run_build=False)

        blocking_coverage = bool(
            (coverage.frontend is not None and coverage.frontend.blocking)
            or (coverage.mobile is not None and coverage.mobile.blocking)
        )
        app_scores = [app.score for app in (coverage.frontend, coverage.mobile) if app is not None]
        functional_coverage_score = round(sum(app_scores) / len(app_scores)) if app_scores else None

        # BLOCKED already means "a structural defect makes the project unsafe/
        # broken regardless of coverage" (functional_completeness.py's own
        # CompletenessStatus docstring) -- that IS an architecture-integrity
        # verdict, just under a different name. Reused as a binary rather than
        # re-detecting duplicate trees/reserved words/leaked markers here too.
        architecture = 0 if completeness.status == "BLOCKED" else 100
        build = completeness.build_completeness if completeness.build_completeness is not None else 0

        status, reason = self._status(
            completeness_status=completeness.status,
            build_skipped=completeness.build_skipped,
            blocker_count=quality_report.blocker_count,
            coverage_blocking=blocking_coverage,
        )

        category_scores = [
            completeness.backend_completeness, completeness.frontend_completeness,
            completeness.mobile_completeness, completeness.security_completeness,
            completeness.documentation_completeness, completeness.tests_completeness,
            completeness.api_coverage_completeness, functional_coverage_score,
            completeness.ui_depth.score if completeness.ui_depth else None,
            architecture, build, completeness.integrations_completeness,
        ]
        present = [score for score in category_scores if score is not None]
        overall = round(sum(present) / len(present)) if present else 0

        return ProductCertificationReport(
            project_id=str(project.get("project_id") or ""),
            status=status,
            reason=reason,
            backend=completeness.backend_completeness,
            frontend=completeness.frontend_completeness,
            mobile=completeness.mobile_completeness,
            security=completeness.security_completeness,
            documentation=completeness.documentation_completeness,
            tests=completeness.tests_completeness,
            endpoint_coverage=completeness.api_coverage_completeness,
            functional_coverage=functional_coverage_score,
            screen_coverage=completeness.ui_depth.score if completeness.ui_depth else None,
            architecture=architecture,
            build=build,
            integrations=completeness.integrations_completeness,
            overall=overall,
            quality_gate_blocker_count=quality_report.blocker_count,
            functional_coverage_blocking=blocking_coverage,
            generated_at=datetime.now(UTC).replace(microsecond=0).isoformat(),
        )

    def _status(
        self, *, completeness_status: str, build_skipped: bool, blocker_count: int, coverage_blocking: bool,
    ) -> tuple[ProductCertificationStatus, str]:
        """Precedence chain, most severe first -- same style _compute_status()/
        compute_kernel_status() already use elsewhere in this codebase.

        build_skipped is checked as its OWN signal (FunctionalCompletenessReport
        carries it directly) rather than inferred from completeness_status text --
        _compute_status() folds a skipped build into the SAME "PARTIALLY_VERIFIED"
        bucket as merely-thin coverage, so the two are NOT distinguishable from
        completeness_status alone. FAILED_CERTIFICATION needs the real boolean."""
        if completeness_status == "NEEDS_HUMAN_REVIEW":
            return "NEEDS_HUMAN_REVIEW", "Functional Completeness Gate could not run resource discovery for this stack."
        if completeness_status == "BLOCKED":
            return "BLOCKED", "A structural defect makes the project unsafe/broken regardless of coverage."
        if build_skipped:
            return "FAILED_CERTIFICATION", "The build never actually passed; auto-repair exhausted its attempts."
        if blocker_count > 0 or coverage_blocking:
            reasons = []
            if blocker_count > 0:
                reasons.append(f"{blocker_count} Quality Gate BLOCKER(s)")
            if coverage_blocking:
                reasons.append("confirmed Functional Coverage error(s)")
            return "NEEDS_REPAIR", f"Real, addressable problem(s) found: {', '.join(reasons)}."
        if completeness_status == "PARTIALLY_VERIFIED":
            return "PARTIALLY_CERTIFIED", "Build passed with no confirmed blockers, but resource/UI coverage is not yet complete."
        return "CERTIFIED", "Build passed, no confirmed blockers, and coverage is complete."


product_certification_engine = ProductCertificationEngine()
