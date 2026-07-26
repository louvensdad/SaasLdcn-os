from __future__ import annotations

import json

import pytest

from app.engines.architecture_manifest_planner import architecture_manifest_planner
from app.engines.frontend_artifact_contract_planner import frontend_artifact_contract_planner
from app.engines.frontend_artifact_gate import frontend_artifact_gate
from app.schemas.orchestrator import ProjectSpec, SuggestedStack


def _contract():
    spec = ProjectSpec(
        raw_intent="Aplicacao com login, registro, sessao protegida e dashboard",
        suggested_stack=SuggestedStack(
            language="TypeScript", framework="Next.js", architecture="clean_architecture",
        ),
    )
    return frontend_artifact_contract_planner.plan(
        spec, {}, architecture_manifest_planner.plan(spec),
    )


def _valid_files():
    contract = _contract()
    files = {
        path: "export default function Artifact() { return null }\n"
        for path in frontend_artifact_contract_planner.required_artifacts(contract)
    }
    files[f"{contract.frontendRoot}/package.json"] = json.dumps({
        "scripts": {
            "dev": "next dev",
            "build": "next build",
            "lint": "next lint",
            "type-check": "tsc --noEmit",
            "test": "vitest --run",
        },
        "dependencies": contract.requiredDependencies,
        "devDependencies": contract.requiredDevDependencies,
    })
    files[f"{contract.frontendRoot}/tsconfig.json"] = json.dumps({
        "compilerOptions": {"paths": {"@/*": ["./src/*"]}},
    })
    files[f"{contract.testRoots[0]}/auth.test.tsx"] = "export const collected = true\n"
    return contract, files


def _evaluate(contract, files, **kwargs):
    return frontend_artifact_gate.evaluate(
        contract,
        files,
        execution={"tests": "passed", "typecheck": "passed", "build": "passed"},
        require_execution=True,
        **kwargs,
    )


@pytest.mark.parametrize(
    ("missing", "signal"),
    [
        ("apps/web/src/stores/authStore.ts", "missingFrontendArtifact"),
        ("apps/web/src/services/authService.ts", "missingFrontendArtifact"),
        ("apps/web/src/lib/api/client.ts", "missingFrontendArtifact"),
        ("apps/web/src/app/register/page.tsx", "invalidFrontendRoute"),
        ("apps/web/src/mocks/handlers/auth.ts", "incompleteAuthenticationArtifacts"),
    ],
)
def test_craftforge_missing_artifacts_block(missing, signal):
    contract, files = _valid_files()
    files.pop(missing)
    result = _evaluate(contract, files)
    assert result.passed is False
    assert result.signals[signal] is True


def test_unresolved_layout_dashboard_import_blocks():
    contract, files = _valid_files()
    files["apps/web/src/app/dashboard/page.tsx"] = (
        "import LayoutDashboard from '@/components/LayoutDashboard'\n"
        "export default LayoutDashboard\n"
    )
    result = _evaluate(contract, files)
    assert result.signals["unresolvedFrontendImport"] is True


def test_react_error_boundary_import_without_dependency_blocks():
    contract, files = _valid_files()
    package = json.loads(files["apps/web/package.json"])
    package["dependencies"].pop("react-error-boundary")
    files["apps/web/package.json"] = json.dumps(package)
    files["apps/web/src/components/ui/ErrorBoundary.tsx"] = (
        "export { ErrorBoundary } from 'react-error-boundary'\n"
    )
    result = _evaluate(contract, files)
    assert result.signals["missingFrontendDependency"] is True


def test_runner_not_configured_and_tests_not_executed_block():
    contract, files = _valid_files()
    package = json.loads(files["apps/web/package.json"])
    package["scripts"].pop("test")
    files["apps/web/package.json"] = json.dumps(package)
    result = frontend_artifact_gate.evaluate(
        contract,
        files,
        execution={"typecheck": "passed", "build": "passed"},
        require_execution=True,
    )
    assert result.signals["frontendTestsNotExecuted"] is True


@pytest.mark.parametrize(
    ("execution", "signal"),
    [
        ({"tests": "passed", "typecheck": "failed", "build": "passed"}, "frontendTypeCheckFailed"),
        ({"tests": "passed", "typecheck": "passed", "build": "failed"}, "frontendBuildFailed"),
        ({"tests": "failed", "typecheck": "passed", "build": "passed"}, "frontendTestsFailed"),
    ],
)
def test_real_execution_failure_blocks(execution, signal):
    contract, files = _valid_files()
    result = frontend_artifact_gate.evaluate(
        contract, files, execution=execution, require_execution=True,
    )
    assert result.passed is False
    assert result.signals[signal] is True


def test_valid_frontend_passes_every_gate():
    contract, files = _valid_files()
    result = _evaluate(contract, files)
    assert result.passed is True
    assert not any(result.signals.values())
