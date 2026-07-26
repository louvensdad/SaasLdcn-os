from __future__ import annotations

import json
from collections import Counter
from pathlib import PurePosixPath
from typing import Any

from app.engines.frontend_artifact_contract_planner import frontend_artifact_contract_planner
from app.schemas.frontend_artifact_contract import FrontendArtifactContract, FrontendGateResult
from app.services import import_graph_engine


class FrontendArtifactGate:
    def evaluate(
        self,
        contract: FrontendArtifactContract,
        files: dict[str, str],
        *,
        execution: dict[str, str] | None = None,
        require_execution: bool = False,
        require_test_integration: bool = True,
    ) -> FrontendGateResult:
        normalized = {self._normalize(path): content for path, content in files.items()}
        details: dict[str, list[str]] = {}

        required = frontend_artifact_contract_planner.required_artifacts(contract)
        details["missing_artifacts"] = sorted(path for path in required if path not in normalized)

        package_path = f"{contract.frontendRoot}/package.json"
        package = self._json(normalized.get(package_path))
        manifest_by_app = {contract.frontendRoot: package} if package else {}
        js_files = {
            path: content for path, content in normalized.items()
            if path.startswith(contract.frontendRoot + "/") and import_graph_engine.is_js_file(path)
        }
        graph = import_graph_engine.build_import_graph(js_files, manifest_by_app)
        details["unresolved_imports"] = [
            item["detail"] for item in graph["conflicts"]
            if item["status"] in {"unresolved_internal", "cross_stack_leakage"}
        ]
        details["missing_dependencies"] = [
            item["detail"] for item in graph["conflicts"] if item["status"] == "undeclared_external"
        ]
        details["dependency_sections"] = self._dependency_section_errors(contract, package)

        details["invalid_routes"] = [
            f"{route.path} -> {route.pageArtifact}" for route in contract.routes
            if route.pageArtifact not in normalized
        ]
        details["authentication"] = [
            path for path in contract.authenticationArtifacts if path not in normalized
        ]
        details["forbidden_roots"] = [
            path for path in normalized
            if any(path == root or path.startswith(root.rstrip("/") + "/") for root in contract.forbiddenRoots)
        ]
        details["duplicate_artifacts"] = self._duplicates(contract, normalized)
        details["test_integration"] = (
            self._test_integration_errors(contract, normalized, package)
            if require_test_integration else []
        )

        execution = execution or {}
        details["test_execution"] = self._execution_error(execution.get("tests"), "frontend tests", require_execution)
        details["type_check"] = self._execution_error(execution.get("typecheck"), "TypeScript type-check", require_execution)
        details["build"] = self._execution_error(execution.get("build"), "frontend build", require_execution)

        signals = {
            "missingFrontendArtifact": bool(details["missing_artifacts"] or details["forbidden_roots"] or details["duplicate_artifacts"]),
            "unresolvedFrontendImport": bool(details["unresolved_imports"]),
            "missingFrontendDependency": bool(details["missing_dependencies"] or details["dependency_sections"]),
            "invalidFrontendRoute": bool(details["invalid_routes"]),
            "incompleteAuthenticationArtifacts": bool(details["authentication"]),
            "frontendTestsNotExecuted": (
                execution.get("tests") not in {"passed", "failed"}
                if require_execution
                else bool(details["test_integration"])
            ),
            "frontendTestsFailed": execution.get("tests") == "failed",
            "frontendTypeCheckFailed": execution.get("typecheck") != "passed" if require_execution else False,
            "frontendBuildFailed": execution.get("build") != "passed" if require_execution else False,
        }
        blockers = [
            f"{category}:{message}"
            for category, messages in details.items()
            for message in messages
        ]
        return FrontendGateResult(
            passed=not blockers,
            blockers=blockers,
            details={key: value for key, value in details.items() if value},
            signals=signals,
        )

    @staticmethod
    def _dependency_section_errors(contract: FrontendArtifactContract, package: dict[str, Any]) -> list[str]:
        prod = package.get("dependencies") if isinstance(package.get("dependencies"), dict) else {}
        dev = package.get("devDependencies") if isinstance(package.get("devDependencies"), dict) else {}
        errors = [
            f"{name} must be declared in dependencies"
            for name in contract.requiredDependencies if name not in prod
        ]
        errors.extend(
            f"{name} must be declared in devDependencies"
            for name in contract.requiredDevDependencies if name not in dev
        )
        errors.extend(
            f"{name} is a production dependency incorrectly declared in devDependencies"
            for name in contract.requiredDependencies if name in dev and name not in prod
        )
        return errors

    @staticmethod
    def _test_integration_errors(
        contract: FrontendArtifactContract,
        files: dict[str, str],
        package: dict[str, Any],
    ) -> list[str]:
        scripts = package.get("scripts") if isinstance(package.get("scripts"), dict) else {}
        errors = []
        if not scripts.get("test") or "no test specified" in str(scripts.get("test", "")).lower():
            errors.append("package.json has no real test script")
        if not scripts.get("type-check"):
            errors.append("package.json has no type-check script")
        if not scripts.get("build"):
            errors.append("package.json has no build script")
        tests = [
            path for path in files
            if any(path.startswith(root.rstrip("/") + "/") for root in contract.testRoots)
            and (".test." in path or ".spec." in path)
        ]
        if not tests:
            errors.append("no executable frontend test file is registered under testRoots")
        if contract.mockFramework == "msw" and not any("/mocks/" in path or "/msw/" in path for path in files):
            errors.append("MSW is enabled but no mock artifact exists")
        return errors

    @staticmethod
    def _duplicates(contract: FrontendArtifactContract, files: dict[str, str]) -> list[str]:
        counts = Counter(PurePosixPath(path).name for path in files)
        return sorted(name for name in contract.forbiddenDuplicateArtifacts if counts[name] > 1)

    @staticmethod
    def _execution_error(status: str | None, label: str, required: bool) -> list[str]:
        if not required:
            return []
        if status == "passed":
            return []
        return [f"{label} was {'not executed' if status is None else status}"]

    @staticmethod
    def _json(content: str | None) -> dict[str, Any]:
        try:
            value = json.loads(content or "")
        except (TypeError, ValueError):
            return {}
        return value if isinstance(value, dict) else {}

    @staticmethod
    def _normalize(path: str) -> str:
        return path.replace("\\", "/").lstrip("./")


frontend_artifact_gate = FrontendArtifactGate()
