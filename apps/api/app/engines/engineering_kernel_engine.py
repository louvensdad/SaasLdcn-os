from __future__ import annotations

from datetime import UTC, datetime

from app.engines.quality_gate_engine import quality_gate_engine
from app.schemas.engineering_kernel import EngineeringKernelStatus, EvidenceItem
from app.services.generated_project_service import GeneratedProjectService
from app.services.project_writer import DEFAULT_OUTPUT_ROOT, ProjectWriter

# Engineering Kernel (Engineering Employee Mode, section 5): a single, reusable
# computation of "what state is this project in," extracted verbatim from the
# precedence routes/meta_factory.py::_require_verified already used inline. This
# is a consolidation of already-computed signals (Quality Gate, build
# verification, Functional Completeness Gate), not a new judgment call.

_FILE_EVIDENCE = (
    ("product_completion_report", "Product Completion Report", "product-completion-report.json"),
    ("endpoint_ui_coverage", "Endpoint/UI Coverage", "endpoint-ui-coverage.json"),
    ("ui_depth_score", "UI Depth Score", "ui-depth-score.json"),
)


def _meta_project(project_id: str) -> dict:
    return {"project_id": project_id, "generated_project_path": str(DEFAULT_OUTPUT_ROOT / project_id)}


def compute_kernel_status(project_id: str) -> EngineeringKernelStatus:
    writer = ProjectWriter()
    verdict = writer.read_verification(project_id)
    completeness = writer.read_functional_completeness(project_id)
    baseline = writer.read_quality_gate_baseline(project_id)
    override = writer.read_release_override(project_id)
    human_review = writer.read_human_review_acknowledgment(project_id)

    project = _meta_project(project_id)
    report = quality_gate_engine.evaluate(project, run_build=False)

    completeness_status = completeness.get("status") if completeness else None

    if completeness is not None and completeness_status != "VERIFIED":
        state = completeness_status
        reason = f"Functional Completeness Gate: {completeness_status}."
    elif verdict.get("verified"):
        state = "VERIFIED"
        reason = "Build verificado e nenhum bloqueio pendente."
    elif report.blocker_count > 0:
        state = "BLOCKED"
        reason = f"{report.blocker_count} problema(s) crítico(s) do Quality Gate."
    else:
        state = "PARTIALLY_VERIFIED"
        reason = "Build não verificado formalmente e nenhum bloqueador crítico encontrado."

    override_reason = override.get("reason") if override else None
    human_review_reason = human_review.get("reason") if human_review else None

    files = GeneratedProjectService().list_files(project)
    file_names = {entry["relative_path"] for entry in files["files"]}

    evidence = [
        EvidenceItem(id="verification", label="Build Verification", available=bool(verdict.get("verified") or verdict.get("verification_score")), source="marker"),
        EvidenceItem(id="quality_gate_baseline", label="Quality Gate Baseline", available=baseline is not None, source="marker"),
        EvidenceItem(id="functional_completeness", label="Functional Completeness Report", available=completeness is not None, source="marker"),
        EvidenceItem(id="release_override", label="Release Override", available=override is not None, source="marker"),
        EvidenceItem(id="human_review_acknowledgment", label="Human Review Acknowledgment", available=human_review is not None, source="marker"),
    ]
    for evidence_id, label, filename in _FILE_EVIDENCE:
        evidence.append(
            EvidenceItem(
                id=evidence_id, label=label, available=filename in file_names, source="file",
                path=filename if filename in file_names else None,
            )
        )

    return EngineeringKernelStatus(
        project_id=project_id,
        state=state,
        reason=reason,
        override_active=report.release_override,
        override_reason=override_reason,
        human_review_acknowledged=human_review is not None,
        human_review_reason=human_review_reason,
        build_verified=bool(verdict.get("verified")),
        quality_gate_blocker_count=report.blocker_count,
        functional_completeness_status=completeness_status,
        evidence=evidence,
        generated_at=datetime.now(UTC).replace(microsecond=0).isoformat(),
    )
