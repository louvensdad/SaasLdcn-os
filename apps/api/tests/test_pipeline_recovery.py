from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.engines.cause_validator import cause_validator
from app.engines.pipeline_recovery_orchestrator import pipeline_recovery_orchestrator
from app.engines.repair_engineer import RepairNotAuthorized, repair_engineer
from app.engines.root_cause_investigator import root_cause_investigator
from app.schemas.pipeline_recovery import CauseValidation, RepairChange
from app.services.file_protocol import EmittedFile


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _base_job(**overrides) -> dict:
    job = {
        "id": "genjob_test",
        "currentStage": "BUILD_RUNNING",
        "error": {
            "stage": "BUILD_RUNNING",
            "message": "Artifact 'backend/app/application/services/auth_service.py' blocked: high-confidence secret material is forbidden (real_secret).",
            "last_successful_checkpoint": "DOCUMENTATION_GENERATING",
        },
        "artifacts": [
            {"kind": "generated", "name": "backend/app/application/services/auth_service.py", "valid": True},
        ],
        "events": [],
        "checkpoints": [
            {"stage": "DOCUMENTATION_GENERATING", "status": "success"},
            {"stage": "BUILD_RUNNING", "status": "failed"},
        ],
    }
    job.update(overrides)
    return job


# ---------------------------------------------------------------------------
# Agent 1: RootCauseInvestigator
# ---------------------------------------------------------------------------

class TestRootCauseInvestigator:
    def test_identifies_secret_block_hypothesis_with_evidence(self):
        analysis = root_cause_investigator.investigate(_base_job())
        assert analysis.jobId == "genjob_test"
        assert analysis.failedStage == "BUILD_RUNNING"
        assert "backend/app/application/services/auth_service.py" in analysis.affectedArtifacts
        assert analysis.hypotheses, "expected at least one ranked hypothesis"
        assert analysis.hypotheses[0].confidence == max(h.confidence for h in analysis.hypotheses)
        assert analysis.firstDivergencePoint == "DOCUMENTATION_GENERATING"
        assert analysis.evidence

    def test_never_mutates_job(self):
        job = _base_job()
        snapshot = dict(job)
        root_cause_investigator.investigate(job)
        assert job == snapshot

    def test_detects_duplicate_basenames_across_roots(self):
        job = _base_job(error={"stage": "BUILD_RUNNING", "message": "Build final nao passou.", "last_successful_checkpoint": "BACKEND_VALIDATING"})
        job["artifacts"] = [
            {"kind": "generated", "name": "backend/app/application/services/auth_service.py", "valid": True},
            {"kind": "generated", "name": "app/services/auth_service.py", "valid": True},
            {"kind": "generated", "name": "backend/src/app/services/auth_service.py", "valid": True},
        ]
        analysis = root_cause_investigator.investigate(job)
        assert any("different paths" in line for line in analysis.evidence)
        assert any(h.description.lower().count("fragment") or "competing" in h.description.lower() or "architectural" in h.description.lower() for h in analysis.hypotheses)

    def test_falls_back_to_generic_hypothesis_when_nothing_recognized(self):
        job = _base_job(error={"stage": "CONTRACTS_GENERATING", "message": "Something unexpected exploded."})
        analysis = root_cause_investigator.investigate(job)
        assert analysis.hypotheses
        assert analysis.recommendedInspection


# ---------------------------------------------------------------------------
# Agent 2: CauseValidator
# ---------------------------------------------------------------------------

class TestCauseValidator:
    def _analysis_for(self, content: str, path: str = "backend/app/application/services/auth_service.py"):
        job = _base_job(error={
            "stage": "BUILD_RUNNING",
            "message": f"Artifact '{path}' blocked: high-confidence secret material is forbidden.",
            "last_successful_checkpoint": "DOCUMENTATION_GENERATING",
        })
        return root_cause_investigator.investigate(job), job

    def test_confirms_real_secret(self):
        analysis, job = self._analysis_for('SECRET_KEY = "Xk9#mP2$vQ7nZ4wR8tY1uL5cB3sA6dF0"\n')
        validation = cause_validator.validate(
            analysis, job,
            read_artifact=lambda path: 'SECRET_KEY = "Xk9#mP2$vQ7nZ4wR8tY1uL5cB3sA6dF0"\n',
        )
        assert validation.confirmed is True
        assert validation.classification == "REAL_SECRET"
        assert validation.requiresApproval is True

    def test_confirms_false_positive_for_placeholder(self):
        analysis, job = self._analysis_for('SECRET_KEY = "change-me"\n')
        validation = cause_validator.validate(
            analysis, job, read_artifact=lambda path: 'SECRET_KEY = "change-me"\n',
        )
        assert validation.classification == "FALSE_POSITIVE"
        assert validation.requiresApproval is False

    def test_confirms_false_positive_for_env_reference(self):
        analysis, job = self._analysis_for('SECRET_KEY = os.getenv("SECRET_KEY")\n')
        validation = cause_validator.validate(
            analysis, job, read_artifact=lambda path: 'SECRET_KEY = os.getenv("SECRET_KEY")\n',
        )
        assert validation.classification == "FALSE_POSITIVE"

    def test_confirms_false_positive_for_test_fixture(self):
        analysis, job = self._analysis_for('API_KEY = "test-key-1234567890abcdef"\n', path="tests/fixtures/auth.py")
        validation = cause_validator.validate(
            analysis, job, read_artifact=lambda path: 'API_KEY = "test-key-1234567890abcdef"\n',
        )
        assert validation.classification == "FALSE_POSITIVE"

    def test_confirms_false_positive_for_documentation(self):
        analysis, job = self._analysis_for("Set SECRET_KEY=example1234567890abcdef in your .env\n", path="docs/setup.md")
        validation = cause_validator.validate(
            analysis, job, read_artifact=lambda path: "Set SECRET_KEY=example1234567890abcdef in your .env\n",
        )
        assert validation.classification == "FALSE_POSITIVE"

    def test_unsafe_template_stays_ambiguous_and_requires_approval(self):
        # Real .env-style file (not a template), bare unquoted value: this is
        # the case that must NOT be waved through just because it isn't a
        # known real-credential format -- ambiguous stays fail-safe.
        content = "SESSION_SECRET=aVeryLongButNotObviouslyRandomToken123\n"
        analysis, job = self._analysis_for(content, path="backend/config.properties")
        validation = cause_validator.validate(
            analysis, job, read_artifact=lambda path: content,
        )
        assert validation.classification in {"UNSAFE_TEMPLATE", "REAL_SECRET"}
        assert validation.requiresApproval is True

    def test_generation_conflict_for_duplicate_roots(self):
        job = _base_job(error={"stage": "BUILD_RUNNING", "message": "Build final nao passou.", "last_successful_checkpoint": "BACKEND_VALIDATING"})
        job["artifacts"] = [
            {"kind": "generated", "name": "backend/app/application/services/auth_service.py", "valid": True},
            {"kind": "generated", "name": "app/services/auth_service.py", "valid": True},
        ]
        analysis = root_cause_investigator.investigate(job)
        validation = cause_validator.validate(analysis, job, read_artifact=lambda path: None)
        assert validation.classification == "GENERATION_CONFLICT"
        assert validation.requiresApproval is True
        assert validation.canonicalArtifact == "backend/app/application/services/auth_service.py"

    def test_unknown_when_artifact_unreadable(self):
        analysis, job = self._analysis_for("irrelevant")
        validation = cause_validator.validate(analysis, job, read_artifact=lambda path: None)
        assert validation.classification == "UNKNOWN"
        assert validation.requiresApproval is True

    def test_never_mutates_job_or_analysis(self):
        analysis, job = self._analysis_for('SECRET_KEY = "change-me"\n')
        job_snapshot = dict(job)
        analysis_snapshot = analysis.model_dump()
        cause_validator.validate(analysis, job, read_artifact=lambda path: 'SECRET_KEY = "change-me"\n')
        assert job == job_snapshot
        assert analysis.model_dump() == analysis_snapshot


# ---------------------------------------------------------------------------
# Agent 3: RepairEngineer
# ---------------------------------------------------------------------------

class TestRepairEngineer:
    def test_refuses_when_cause_not_confirmed(self):
        validation = CauseValidation(
            confirmed=False, classification="UNKNOWN",
            safeCorrectionStrategy="n/a", regressionRisk="n/a", requiresApproval=True,
        )
        with pytest.raises(RepairNotAuthorized):
            repair_engineer.repair_secret_block(validation, [], approved=True)

    def test_refuses_when_approval_required_but_not_given(self):
        validation = CauseValidation(
            confirmed=True, classification="REAL_SECRET",
            canonicalArtifact="backend/app/core/config.py",
            safeCorrectionStrategy="redact", regressionRisk="high", requiresApproval=True,
        )
        with pytest.raises(RepairNotAuthorized):
            repair_engineer.repair_secret_block(
                validation, [EmittedFile(path="backend/app/core/config.py", content='SECRET_KEY = "x"\n')],
                approved=False,
            )

    def test_false_positive_leaves_content_unchanged(self):
        original = 'SECRET_KEY = "change-me"\n'
        validation = CauseValidation(
            confirmed=True, classification="FALSE_POSITIVE",
            canonicalArtifact="backend/app/core/config.py",
            safeCorrectionStrategy="none needed", regressionRisk="low", requiresApproval=False,
        )
        files, report = repair_engineer.repair_secret_block(
            validation, [EmittedFile(path="backend/app/core/config.py", content=original)], approved=False,
        )
        assert files[0].content == original
        assert report.filesChanged == []
        assert not report.testsFailed

    def test_real_secret_redacts_and_never_leaves_the_literal_in_place(self):
        secret_value = "Xk9#mP2$vQ7nZ4wR8tY1uL5cB3sA6dF0"
        original = f'SECRET_KEY = "{secret_value}"\n'
        validation = CauseValidation(
            confirmed=True, classification="REAL_SECRET",
            canonicalArtifact="backend/app/core/config.py",
            safeCorrectionStrategy="redact", regressionRisk="high", requiresApproval=True,
        )
        files, report = repair_engineer.repair_secret_block(
            validation, [EmittedFile(path="backend/app/core/config.py", content=original)], approved=True,
        )
        assert secret_value not in files[0].content
        assert report.filesChanged == ["backend/app/core/config.py"]
        assert not report.testsFailed
        assert report.remainingRisks, "must not silently discard the fact that a real secret was found"

    def test_repair_never_disables_the_scanner_globally(self):
        # After repair, an *independent* real secret in a different file must
        # still block -- the fix is scoped to the one confirmed artifact,
        # never a global relaxation.
        secret_value = "Xk9#mP2$vQ7nZ4wR8tY1uL5cB3sA6dF0"
        validation = CauseValidation(
            confirmed=True, classification="REAL_SECRET",
            canonicalArtifact="backend/app/core/config.py",
            safeCorrectionStrategy="redact", regressionRisk="high", requiresApproval=True,
        )
        files, _ = repair_engineer.repair_secret_block(
            validation,
            [
                EmittedFile(path="backend/app/core/config.py", content=f'SECRET_KEY = "{secret_value}"\n'),
                EmittedFile(path="backend/app/other.py", content=f'OTHER_SECRET = "{secret_value}"\n'),
            ],
            approved=True,
        )
        from app.services.artifact_security import artifact_block_reason
        other = next(f for f in files if f.path == "backend/app/other.py")
        assert artifact_block_reason("backend/app/other.py", other.content) != ""


class TestRepairEngineerGenerationConflict:
    """LDCN Multi-Agent Runtime, Phase 3: repair_generation_conflict, the
    real repair path for the classification RepairEngineer used to have no
    strategy for at all."""

    def _validation(self, **overrides) -> CauseValidation:
        base = dict(
            confirmed=True, classification="GENERATION_CONFLICT",
            canonicalArtifact="backend/app/models/order.py",
            duplicateArtifacts=["src/app/models/order.py"],
            safeCorrectionStrategy="Keep the canonical artifact, drop the duplicate.",
            regressionRisk="Medium: dropping the wrong duplicate would remove real generated code.",
            requiresApproval=True,
        )
        base.update(overrides)
        return CauseValidation(**base)

    def test_refuses_when_cause_not_confirmed(self):
        validation = self._validation(confirmed=False)
        with pytest.raises(RepairNotAuthorized):
            repair_engineer.repair_generation_conflict(validation, [], approved=True)

    def test_refuses_a_non_generation_conflict_classification(self):
        validation = self._validation(classification="REAL_SECRET")
        with pytest.raises(RepairNotAuthorized):
            repair_engineer.repair_generation_conflict(validation, [], approved=True)

    def test_refuses_when_approval_required_but_not_given(self):
        validation = self._validation()
        files = [
            EmittedFile(path="backend/app/models/order.py", content="class Order: ...\n"),
            EmittedFile(path="src/app/models/order.py", content="class Order: ...  # dup\n"),
        ]
        with pytest.raises(RepairNotAuthorized):
            repair_engineer.repair_generation_conflict(validation, files, approved=False)

    def test_drops_the_duplicate_and_keeps_the_canonical(self):
        validation = self._validation()
        files = [
            EmittedFile(path="backend/app/models/order.py", content="class Order: ...\n"),
            EmittedFile(path="src/app/models/order.py", content="class Order: ...  # dup\n"),
            EmittedFile(path="backend/app/main.py", content="# entrypoint\n"),
        ]
        repaired, report = repair_engineer.repair_generation_conflict(validation, files, approved=True)
        assert {f.path for f in repaired} == {"backend/app/models/order.py", "backend/app/main.py"}
        assert report.changes == [RepairChange(
            file="src/app/models/order.py", action="delete",
            reason="Duplicate of canonical artifact 'backend/app/models/order.py'; dropped to resolve the generation conflict.",
        )]
        assert report.filesChanged == ["src/app/models/order.py"]

    def test_never_touches_the_canonical_files_content(self):
        validation = self._validation()
        canonical_content = "class Order: ...  # the real implementation\n"
        files = [
            EmittedFile(path="backend/app/models/order.py", content=canonical_content),
            EmittedFile(path="src/app/models/order.py", content="class Order: ...  # dup\n"),
        ]
        repaired, _ = repair_engineer.repair_generation_conflict(validation, files, approved=True)
        canonical = next(f for f in repaired if f.path == "backend/app/models/order.py")
        assert canonical.content == canonical_content

    def test_multiple_duplicates_all_dropped(self):
        validation = self._validation(duplicateArtifacts=["src/app/models/order.py", "backend/src/app/models/order.py"])
        files = [
            EmittedFile(path="backend/app/models/order.py", content="class Order: ...\n"),
            EmittedFile(path="src/app/models/order.py", content="class Order: ...  # dup1\n"),
            EmittedFile(path="backend/src/app/models/order.py", content="class Order: ...  # dup2\n"),
        ]
        repaired, report = repair_engineer.repair_generation_conflict(validation, files, approved=True)
        assert {f.path for f in repaired} == {"backend/app/models/order.py"}
        assert set(report.filesChanged) == {"src/app/models/order.py", "backend/src/app/models/order.py"}

    def test_regression_check_fails_if_the_canonical_itself_still_collides(self):
        # Contrived: two artifacts share the canonical's own basename even
        # after the declared duplicates are dropped -- the self-check must
        # catch that instead of reporting a false RECOVERED.
        validation = self._validation(duplicateArtifacts=["src/app/models/order.py"])
        files = [
            EmittedFile(path="backend/app/models/order.py", content="class Order: ...\n"),
            EmittedFile(path="src/app/models/order.py", content="class Order: ...  # dup\n"),
            EmittedFile(path="frontend/order.py", content="# unrelated collision left behind\n"),
        ]
        _, report = repair_engineer.repair_generation_conflict(validation, files, approved=True)
        assert report.testsFailed
        assert not report.testsPassed

    def test_refuses_when_no_declared_duplicate_is_actually_present(self):
        validation = self._validation(duplicateArtifacts=["src/app/models/order.py"])
        files = [EmittedFile(path="backend/app/models/order.py", content="class Order: ...\n")]
        with pytest.raises(RepairNotAuthorized):
            repair_engineer.repair_generation_conflict(validation, files, approved=True)


# ---------------------------------------------------------------------------
# Orchestrator: ordering, approval gating, end-to-end
# ---------------------------------------------------------------------------

class TestPipelineRecoveryOrchestrator:
    def test_agents_run_in_order_root_cause_then_validate_then_repair(self):
        job = _base_job(error={
            "stage": "BUILD_RUNNING",
            "message": "Artifact 'backend/app/core/config.py' blocked: high-confidence secret material is forbidden.",
            "last_successful_checkpoint": "DOCUMENTATION_GENERATING",
        })
        job["artifacts"] = [{"kind": "generated", "name": "backend/app/core/config.py", "valid": True}]
        files = [EmittedFile(path="backend/app/core/config.py", content='SECRET_KEY = "change-me"\n')]
        run, _ = pipeline_recovery_orchestrator.run_recovery(
            job, "user-1", files=files,
            read_artifact=lambda path: 'SECRET_KEY = "change-me"\n', now=_now,
        )
        states = [event.state for event in run.events]
        assert states.index("ROOT_CAUSE_ANALYZING") < states.index("CAUSE_VALIDATING")
        assert states.index("CAUSE_VALIDATING") < states.index("REPAIRING")
        assert states.index("REPAIRING") < states.index("REGRESSION_TESTING")
        assert states.index("REGRESSION_TESTING") < states.index("RESUMING")
        assert run.rootCauseAnalysis is not None
        assert run.causeValidation is not None
        assert run.repairReport is not None

    def test_false_positive_recovers_fully_without_approval(self):
        job = _base_job(error={
            "stage": "BUILD_RUNNING",
            "message": "Artifact 'backend/app/core/config.py' blocked: high-confidence secret material is forbidden.",
            "last_successful_checkpoint": "DOCUMENTATION_GENERATING",
        })
        job["artifacts"] = [{"kind": "generated", "name": "backend/app/core/config.py", "valid": True}]
        files = [EmittedFile(path="backend/app/core/config.py", content='SECRET_KEY = "change-me"\n')]
        run, repaired = pipeline_recovery_orchestrator.run_recovery(
            job, "user-1", files=files,
            read_artifact=lambda path: 'SECRET_KEY = "change-me"\n', now=_now,
        )
        assert run.state == "RECOVERED"
        assert run.outcome == "RECOVERED"
        assert "WAITING_REPAIR_APPROVAL" not in [e.state for e in run.events]
        assert repaired[0].content == 'SECRET_KEY = "change-me"\n'

    def test_real_secret_halts_at_waiting_repair_approval_without_auto_approve(self):
        secret_value = "Xk9#mP2$vQ7nZ4wR8tY1uL5cB3sA6dF0"
        job = _base_job(error={
            "stage": "BUILD_RUNNING",
            "message": "Artifact 'backend/app/core/config.py' blocked: high-confidence secret material is forbidden.",
            "last_successful_checkpoint": "DOCUMENTATION_GENERATING",
        })
        job["artifacts"] = [{"kind": "generated", "name": "backend/app/core/config.py", "valid": True}]
        files = [EmittedFile(path="backend/app/core/config.py", content=f'SECRET_KEY = "{secret_value}"\n')]
        run, unchanged = pipeline_recovery_orchestrator.run_recovery(
            job, "user-1", files=files,
            read_artifact=lambda path: f'SECRET_KEY = "{secret_value}"\n', now=_now,
        )
        assert run.state == "WAITING_REPAIR_APPROVAL"
        assert run.outcome is None
        assert unchanged[0].content == f'SECRET_KEY = "{secret_value}"\n'
        assert "REPAIRING" not in [e.state for e in run.events]

    def test_real_secret_proceeds_when_auto_approve_is_explicitly_set(self):
        secret_value = "Xk9#mP2$vQ7nZ4wR8tY1uL5cB3sA6dF0"
        job = _base_job(error={
            "stage": "BUILD_RUNNING",
            "message": "Artifact 'backend/app/core/config.py' blocked: high-confidence secret material is forbidden.",
            "last_successful_checkpoint": "DOCUMENTATION_GENERATING",
        })
        job["artifacts"] = [{"kind": "generated", "name": "backend/app/core/config.py", "valid": True}]
        files = [EmittedFile(path="backend/app/core/config.py", content=f'SECRET_KEY = "{secret_value}"\n')]
        run, repaired = pipeline_recovery_orchestrator.run_recovery(
            job, "user-1", files=files,
            read_artifact=lambda path: f'SECRET_KEY = "{secret_value}"\n', now=_now,
            auto_approve=True,
        )
        assert run.state == "RECOVERED"
        assert secret_value not in repaired[0].content
        assert run.repairReport.remainingRisks

    def test_generation_conflict_with_no_matching_files_is_not_silently_repaired(self):
        # LDCN Multi-Agent Runtime, Phase 3: GENERATION_CONFLICT now has a
        # real repair path (repair_generation_conflict, below) -- but an
        # empty file set has nothing for it to act on, so it must still
        # refuse rather than report a fake success. See
        # test_generation_conflict_repairs_by_dropping_the_duplicate for the
        # real repair happening when the duplicate files are actually present.
        job = _base_job(error={"stage": "BUILD_RUNNING", "message": "Build final nao passou.", "last_successful_checkpoint": "BACKEND_VALIDATING"})
        job["artifacts"] = [
            {"kind": "generated", "name": "backend/app/application/services/auth_service.py", "valid": True},
            {"kind": "generated", "name": "app/services/auth_service.py", "valid": True},
        ]
        run, files = pipeline_recovery_orchestrator.run_recovery(
            job, "user-1", files=[], read_artifact=lambda path: None, now=_now, auto_approve=True,
        )
        assert run.outcome == "RECOVERY_FAILED"
        assert run.repairReport is None

    def test_generation_conflict_repairs_by_dropping_the_duplicate(self):
        # LDCN Multi-Agent Runtime, Phase 3 (real gap closed 2026-07): the
        # duplicate artifact is dropped, the canonical one (chosen by the
        # SAME architecture_analysis.pick_canonical ArchitectureConsolidationGate
        # uses) is kept, and a real regression re-check proves the conflict
        # is actually gone -- end to end through the real orchestrator, not
        # just the RepairEngineer method in isolation.
        job = _base_job(error={"stage": "BUILD_RUNNING", "message": "Build final nao passou.", "last_successful_checkpoint": "BACKEND_VALIDATING"})
        job["artifacts"] = [
            {"kind": "generated", "name": "backend/app/application/services/auth_service.py", "valid": True},
            {"kind": "generated", "name": "app/services/auth_service.py", "valid": True},
        ]
        files = [
            EmittedFile(path="backend/app/application/services/auth_service.py", content="class AuthService: ...\n"),
            EmittedFile(path="app/services/auth_service.py", content="class AuthService: ...  # duplicate\n"),
            EmittedFile(path="backend/app/main.py", content="# entrypoint\n"),
        ]
        run, repaired = pipeline_recovery_orchestrator.run_recovery(
            job, "user-1", files=files, read_artifact=lambda path: None, now=_now, auto_approve=True,
        )
        assert run.outcome == "RECOVERED"
        assert run.causeValidation.classification == "GENERATION_CONFLICT"
        repaired_paths = {f.path for f in repaired}
        assert repaired_paths == {"backend/app/application/services/auth_service.py", "backend/app/main.py"}
        assert "app/services/auth_service.py" not in repaired_paths
        assert run.repairReport.filesChanged == ["app/services/auth_service.py"]
        assert not run.repairReport.testsFailed
        assert run.repairReport.remainingRisks

    def test_generation_conflict_without_approval_halts_like_a_real_secret_would(self):
        job = _base_job(error={"stage": "BUILD_RUNNING", "message": "Build final nao passou.", "last_successful_checkpoint": "BACKEND_VALIDATING"})
        job["artifacts"] = [
            {"kind": "generated", "name": "backend/app/application/services/auth_service.py", "valid": True},
            {"kind": "generated", "name": "app/services/auth_service.py", "valid": True},
        ]
        files = [
            EmittedFile(path="backend/app/application/services/auth_service.py", content="class AuthService: ...\n"),
            EmittedFile(path="app/services/auth_service.py", content="class AuthService: ...  # duplicate\n"),
        ]
        run, unchanged = pipeline_recovery_orchestrator.run_recovery(
            job, "user-1", files=files, read_artifact=lambda path: None, now=_now,
        )
        assert run.state == "WAITING_REPAIR_APPROVAL"
        assert run.outcome is None
        assert {f.path for f in unchanged} == {f.path for f in files}
        assert "REPAIRING" not in [e.state for e in run.events]

    def test_idempotent_same_inputs_same_verdict(self):
        job = _base_job(error={
            "stage": "BUILD_RUNNING",
            "message": "Artifact 'backend/app/core/config.py' blocked: high-confidence secret material is forbidden.",
            "last_successful_checkpoint": "DOCUMENTATION_GENERATING",
        })
        job["artifacts"] = [{"kind": "generated", "name": "backend/app/core/config.py", "valid": True}]
        files = [EmittedFile(path="backend/app/core/config.py", content='SECRET_KEY = "change-me"\n')]
        run1, repaired1 = pipeline_recovery_orchestrator.run_recovery(
            job, "user-1", files=files, read_artifact=lambda path: 'SECRET_KEY = "change-me"\n', now=_now,
        )
        run2, repaired2 = pipeline_recovery_orchestrator.run_recovery(
            job, "user-1", files=files, read_artifact=lambda path: 'SECRET_KEY = "change-me"\n', now=_now,
        )
        assert run1.outcome == run2.outcome == "RECOVERED"
        assert run1.causeValidation.classification == run2.causeValidation.classification
        assert repaired1[0].content == repaired2[0].content

    def test_notification_types_attached_to_key_transitions(self):
        job = _base_job(error={
            "stage": "BUILD_RUNNING",
            "message": "Artifact 'backend/app/core/config.py' blocked: high-confidence secret material is forbidden.",
            "last_successful_checkpoint": "DOCUMENTATION_GENERATING",
        })
        job["artifacts"] = [{"kind": "generated", "name": "backend/app/core/config.py", "valid": True}]
        files = [EmittedFile(path="backend/app/core/config.py", content='SECRET_KEY = "change-me"\n')]
        run, _ = pipeline_recovery_orchestrator.run_recovery(
            job, "user-1", files=files, read_artifact=lambda path: 'SECRET_KEY = "change-me"\n', now=_now,
        )
        notif_types = {e.detail.get("notification_type") for e in run.events if e.detail.get("notification_type")}
        assert "DIAGNOSIS_STARTED" in notif_types
        assert "PIPELINE_RECOVERED" in notif_types
