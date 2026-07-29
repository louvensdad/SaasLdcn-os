from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.engines.generation_job_engine import GenerationJobEngine, StageFailure
from app.routes import meta_factory
from app.services.delivery_eligibility_policy import DeliveryEligibilityError, DeliveryEligibilityPolicy


def _approved_job(**changes):
    job = {
        "generatedProjectId": "generated-1",
        "partial": False,
        "degraded": False,
        "valid": True,
        "buildStatus": "PASSED",
        "testStatus": "passed",
        "pytestCollectionStatus": "passed",
        "repairComplete": True,
        "unresolvedImports": [],
        "missingDependencies": [],
        "duplicateArchitecture": False,
        "readmeValid": True,
        "dockerValid": True,
        "mandatoryGates": {"imports": "passed", "docker": "passed"},
        "stageStatuses": {"tests": "success", "build": "success", "package": "success"},
    }
    job.update(changes)
    return job


@pytest.mark.parametrize(
    ("changes", "blocker"),
    [
        ({"partial": True}, "partial"),
        ({"buildStatus": "SKIPPED_AFTER_FAILURE"}, "skipped_after_failure"),
        ({"buildStatus": "FAILED"}, "build_not_passed"),
        ({"repairComplete": False}, "repair_incomplete"),
        ({"testStatus": "failed"}, "tests_failed"),
        ({"pytestCollectionStatus": "failed"}, "pytest_collection_failed"),
        ({"unresolvedImports": ["react"]}, "unresolved_imports"),
        ({"missingDependencies": ["react"]}, "missing_dependencies"),
        ({"duplicateArchitecture": True}, "duplicate_architecture"),
        ({"missingFrontendArtifact": True}, "missing_frontend_artifact"),
        ({"unresolvedFrontendImport": True}, "unresolved_frontend_import"),
        ({"missingFrontendDependency": True}, "missing_frontend_dependency"),
        ({"invalidFrontendRoute": True}, "invalid_frontend_route"),
        ({"incompleteAuthenticationArtifacts": True}, "incomplete_authentication_artifacts"),
        ({"frontendTestsNotExecuted": True}, "frontend_tests_not_executed"),
        ({"frontendTestsFailed": True}, "frontend_tests_failed"),
        ({"frontendTypeCheckFailed": True}, "frontend_type_check_failed"),
        ({"frontendBuildFailed": True}, "frontend_build_failed"),
        ({"readmeValid": False}, "readme_invalid"),
        ({"dockerValid": False}, "docker_invalid"),
        ({"mandatoryGates": {"imports": "not_run"}}, "mandatory_gate:imports"),
    ],
)
def test_mandatory_failures_block_delivery(changes, blocker):
    decision = DeliveryEligibilityPolicy().evaluate(_approved_job(**changes))
    assert decision.eligible is False
    assert blocker in decision.blockers


def test_partially_verified_and_force_cannot_bypass_mandatory_failure():
    job = _approved_job(partial=True, completenessStatus="PARTIALLY_VERIFIED", force=True, override=True)
    with pytest.raises(DeliveryEligibilityError):
        DeliveryEligibilityPolicy().require(job)


def test_frontend_gate_failure_hides_download_even_with_force_and_partially_verified():
    job = _approved_job(
        frontendTypeCheckFailed=True,
        completenessStatus="PARTIALLY_VERIFIED",
        force=True,
        override=True,
    )
    decision = DeliveryEligibilityPolicy().evaluate(job)
    download_url = "/api/meta-factory/generated-1/download" if decision.eligible else None
    assert decision.eligible is False
    assert download_url is None


def test_partial_blocks_package(monkeypatch):
    engine = GenerationJobEngine.__new__(GenerationJobEngine)
    job = _approved_job(partial=True, stageStatuses={"build": "success", "package": "running"})
    job["id"] = "job-1"
    job["workspaceId"] = "enterprise"
    monkeypatch.setattr(engine, "_diagnostic", lambda *args, **kwargs: {"message": "blocked"})
    with pytest.raises(StageFailure, match="politica central"):
        engine._package(job, "user-1")


def test_download_revalidates_policy_at_request_time(monkeypatch):
    class Repository:
        @staticmethod
        def latest_for_generated_project(project_id, user_id):
            return _approved_job(partial=True)

    monkeypatch.setattr(meta_factory.generation_job_engine, "repository", Repository())
    with pytest.raises(HTTPException) as exc:
        meta_factory._require_delivery_eligible("generated-1", "user-1")
    assert exc.value.status_code == 409
    assert "partial" in exc.value.detail["blockers"]


def test_blocked_project_remains_available_for_diagnostics(tmp_path):
    project = tmp_path / "generated-1"
    project.mkdir()
    diagnostic = project / "build.report.json"
    diagnostic.write_text('{"passed": false}', encoding="utf-8")
    with pytest.raises(DeliveryEligibilityError):
        DeliveryEligibilityPolicy().require(_approved_job(partial=True))
    assert diagnostic.read_text(encoding="utf-8") == '{"passed": false}'


def test_fully_approved_project_is_deliverable():
    decision = DeliveryEligibilityPolicy().evaluate(
        _approved_job(), required_stages=("tests", "build", "package")
    )
    assert decision.eligible is True
    assert decision.blockers == ()


def test_partial_cannot_be_completed_or_emit_delivery_ready():
    decision = DeliveryEligibilityPolicy().evaluate(_approved_job(partial=True))
    completed = decision.eligible and "COMPLETED"
    event = "DELIVERY_READY" if decision.eligible else None
    download_url = "/api/meta-factory/generated-1/download" if decision.eligible else None
    assert completed is False
    assert event is None
    assert download_url is None
