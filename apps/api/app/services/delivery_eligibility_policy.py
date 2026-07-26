from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable


@dataclass(frozen=True)
class DeliveryEligibility:
    eligible: bool
    blockers: tuple[str, ...]


class DeliveryEligibilityError(RuntimeError):
    def __init__(self, decision: DeliveryEligibility) -> None:
        self.decision = decision
        super().__init__("Delivery blocked: " + ", ".join(decision.blockers))


class DeliveryEligibilityPolicy:
    """Fail-closed authority for package, completion events, and downloads."""

    _FAILED = frozenset({"failed", "failure", "blocked", "incomplete", "not_run", "pending"})
    _OPTIONAL_STAGE_RESULTS = frozenset({"success", "skipped"})

    def evaluate(
        self,
        job: dict[str, Any],
        *,
        required_stages: Iterable[str] | None = None,
    ) -> DeliveryEligibility:
        blockers: list[str] = []
        stage_statuses = job.get("stageStatuses") or {}

        self._block_if(blockers, bool(job.get("partial")), "partial")
        self._block_if(blockers, bool(job.get("degraded")), "degraded")
        self._block_if(blockers, job.get("buildStatus") != "PASSED", "build_not_passed")
        self._block_if(blockers, "SKIPPED_AFTER_FAILURE" in self._values(job), "skipped_after_failure")
        self._block_if(blockers, not bool(job.get("valid")), "project_invalid")
        self._block_if(blockers, self._failed(job.get("testStatus")), "tests_failed")
        self._block_if(blockers, self._failed(job.get("pytestCollectionStatus")), "pytest_collection_failed")
        self._block_if(blockers, job.get("repairComplete") is False, "repair_incomplete")
        self._block_if(blockers, bool(job.get("unresolvedImports")), "unresolved_imports")
        self._block_if(blockers, bool(job.get("missingDependencies")), "missing_dependencies")
        self._block_if(blockers, bool(job.get("duplicateArchitecture")), "duplicate_architecture")
        self._block_if(blockers, bool(job.get("missingFrontendArtifact")), "missing_frontend_artifact")
        self._block_if(blockers, bool(job.get("unresolvedFrontendImport")), "unresolved_frontend_import")
        self._block_if(blockers, bool(job.get("missingFrontendDependency")), "missing_frontend_dependency")
        self._block_if(blockers, bool(job.get("invalidFrontendRoute")), "invalid_frontend_route")
        self._block_if(
            blockers,
            bool(job.get("incompleteAuthenticationArtifacts")),
            "incomplete_authentication_artifacts",
        )
        self._block_if(blockers, bool(job.get("frontendTestsNotExecuted")), "frontend_tests_not_executed")
        self._block_if(blockers, bool(job.get("frontendTestsFailed")), "frontend_tests_failed")
        self._block_if(blockers, bool(job.get("frontendTypeCheckFailed")), "frontend_type_check_failed")
        self._block_if(blockers, bool(job.get("frontendBuildFailed")), "frontend_build_failed")
        self._block_if(blockers, job.get("readmeValid") is False, "readme_invalid")
        self._block_if(blockers, job.get("dockerValid") is False, "docker_invalid")

        mandatory_gates = job.get("mandatoryGates")
        if isinstance(mandatory_gates, dict):
            for name, result in mandatory_gates.items():
                if str(result).lower() not in {"passed", "success"}:
                    blockers.append(f"mandatory_gate:{name}")

        for stage in required_stages or ():
            result = str(stage_statuses.get(stage, "not_run")).lower()
            allowed = self._OPTIONAL_STAGE_RESULTS if stage == "mobile" else {"success"}
            if result not in allowed:
                blockers.append(f"mandatory_stage:{stage}")

        return DeliveryEligibility(not blockers, tuple(dict.fromkeys(blockers)))

    def require(self, job: dict[str, Any], *, required_stages: Iterable[str] | None = None) -> None:
        decision = self.evaluate(job, required_stages=required_stages)
        if not decision.eligible:
            raise DeliveryEligibilityError(decision)

    @classmethod
    def _failed(cls, value: Any) -> bool:
        return value is not None and str(value).lower() in cls._FAILED

    @staticmethod
    def _values(value: Any) -> set[str]:
        if isinstance(value, dict):
            result = {str(item) for item in value.values()}
            for item in value.values():
                result.update(DeliveryEligibilityPolicy._values(item))
            return result
        if isinstance(value, (list, tuple, set)):
            result = {str(item) for item in value}
            for item in value:
                result.update(DeliveryEligibilityPolicy._values(item))
            return result
        return {str(value)}

    @staticmethod
    def _block_if(blockers: list[str], condition: bool, code: str) -> None:
        if condition:
            blockers.append(code)


delivery_eligibility_policy = DeliveryEligibilityPolicy()
