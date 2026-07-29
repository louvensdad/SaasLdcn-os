from __future__ import annotations

from datetime import UTC, datetime

from app.engines.quality_gate_engine import quality_gate_engine
from app.repositories.generation_job_repository import GenerationJobRepository
from app.schemas.engineering_kernel import EngineeringKernelStatus, EvidenceItem, KernelPhase
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
    ("project_manifest", "Project Manifest", "ldcn.project.json"),
)

# KernelPhase in-flight buckets: grouped straight from the real GenerationJobStatus
# literal (schemas/generation_job.py) and the STEPS order generation_job_engine.py
# walks -- not a new judgment, just naming what each step already means.
_GENERATING_JOB_STATUSES = {
    "QUEUED", "PREPARING_CONTEXT", "CONTRACTS_PLANNING", "CONTRACTS_GENERATING",
    "BACKEND_PLANNING", "BACKEND_GENERATING", "FRONTEND_PLANNING", "FRONTEND_GENERATING",
    "MOBILE_PLANNING", "MOBILE_GENERATING", "DATABASE_PLANNING", "DATABASE_GENERATING",
    "SECURITY_PLANNING", "TESTS_GENERATING", "DOCUMENTATION_GENERATING", "PACKAGE_CREATING",
}
_ANALYZING_JOB_STATUSES = {
    "CONTRACTS_VALIDATING", "BACKEND_VALIDATING", "FRONTEND_VALIDATING",
    "MOBILE_VALIDATING", "DATABASE_VALIDATING", "SECURITY_VALIDATING", "BUILD_RUNNING",
}
# No literal REPAIRING status exists (Engineering Policy gap audit finding #7) --
# these are the closest real analogue: the pipeline is stuck or mid a Build
# Auto-Repair retry (see build_error_classifier.py / the terminal finalizer).
_REPAIRING_JOB_STATUSES = {"PAUSED", "NEEDS_USER_ACTION", "STALLED"}
_TERMINAL_JOB_STATUSES = {"READY", "FAILED"}

_TERMINAL_STATE_TO_PHASE: dict[str, KernelPhase] = {
    "VERIFIED": "CERTIFIED",
    "BLOCKED": "BLOCKED",
    "PARTIALLY_VERIFIED": "PARTIALLY_VERIFIED",
    "NEEDS_HUMAN_REVIEW": "NEEDS_HUMAN_REVIEW",
}


def _in_flight_phase(job_status: str | None) -> KernelPhase | None:
    """None means 'not in flight' (no linked job, or the job already reached a
    terminal status) -- the caller should use the completeness-based terminal
    phase instead."""
    if job_status is None or job_status in _TERMINAL_JOB_STATUSES:
        return None
    if job_status in _GENERATING_JOB_STATUSES:
        return "GENERATING"
    if job_status in _ANALYZING_JOB_STATUSES:
        return "ANALYZING"
    if job_status == "TESTS_RUNNING":
        return "TESTING"
    if job_status in _REPAIRING_JOB_STATUSES:
        return "REPAIRING"
    return "GENERATING"


def _meta_project(project_id: str) -> dict:
    return {"project_id": project_id, "generated_project_path": str(DEFAULT_OUTPUT_ROOT / project_id)}


def compute_kernel_status(project_id: str, owner_user_id: str | None = None) -> EngineeringKernelStatus:
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

    kernel_phase: KernelPhase = _TERMINAL_STATE_TO_PHASE[state]
    if owner_user_id:
        job = GenerationJobRepository().latest_for_generated_project(project_id, owner_user_id)
        if job:
            in_flight = _in_flight_phase(job.get("status"))
            if in_flight is not None:
                kernel_phase = in_flight

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
        kernel_phase=kernel_phase,
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
