from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from app.engines.external_integration_audit_engine import ExternalIntegrationAuditEngine
from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter


@pytest.fixture
def make_project():
    created: list[Path] = []
    writer = ProjectWriter()

    def _make(files: list[tuple[str, str]], name: str = "integration-test") -> dict:
        result = writer.write([EmittedFile(path=p, content=c) for p, c in files], project_name=name)
        created.append(Path(result.root_path))
        return {"project_id": result.project_id, "project_name": name, "generated_project_path": result.root_path}

    yield _make
    for root in created:
        shutil.rmtree(root, ignore_errors=True)


def _manifest(selected_ids: list[str]) -> str:
    return json.dumps({"selected_infrastructure_ids": selected_ids})


def test_no_issues_when_no_known_provider_sdk_is_declared(make_project):
    project = make_project([
        ("package.json", '{"dependencies":{"express":"^4.18.0"}}'),
        ("ldcn.project.json", _manifest([])),
    ])
    assert ExternalIntegrationAuditEngine().audit(project) == []


def test_flags_undeclared_provider_as_blocker(make_project):
    project = make_project([
        ("package.json", '{"dependencies":{"stripe":"^14.0.0"}}'),
        ("ldcn.project.json", _manifest([])),  # user never approved stripe
    ])
    issues = ExternalIntegrationAuditEngine().audit(project)
    issue = next(i for i in issues if i.id == "external_integration_not_opted_in:stripe")
    assert issue.severity == "BLOCKER"


def test_approved_provider_without_resilience_code_is_warning(make_project):
    project = make_project([
        ("package.json", '{"dependencies":{"stripe":"^14.0.0"}}'),
        ("ldcn.project.json", _manifest(["stripe"])),
        ("src/billing/checkout.ts", "import Stripe from 'stripe';\nexport const client = new Stripe('key');"),
    ])
    issues = ExternalIntegrationAuditEngine().audit(project)
    ids = {i.id for i in issues}
    assert "external_integration_not_opted_in:stripe" not in ids
    assert "external_integration_missing_resilience:stripe" in ids
    assert next(i for i in issues if i.id == "external_integration_missing_resilience:stripe").severity == "WARNING"


def test_approved_provider_with_resilience_code_has_no_resilience_warning(make_project):
    project = make_project([
        ("package.json", '{"dependencies":{"stripe":"^14.0.0"}}'),
        ("ldcn.project.json", _manifest(["stripe"])),
        (
            "src/billing/checkout.ts",
            "import Stripe from 'stripe';\n"
            "export const client = new Stripe('key', { timeout: 5000, maxNetworkRetries: 3 });",
        ),
        ("src/billing/checkout.test.ts", "import Stripe from 'stripe';\n// mocked stripe test"),
    ])
    issues = ExternalIntegrationAuditEngine().audit(project)
    ids = {i.id for i in issues}
    assert "external_integration_missing_resilience:stripe" not in ids
    assert "external_integration_missing_tests:stripe" not in ids


def test_approved_provider_without_test_coverage_is_warning(make_project):
    project = make_project([
        ("package.json", '{"dependencies":{"stripe":"^14.0.0"}}'),
        ("ldcn.project.json", _manifest(["stripe"])),
        ("src/billing/checkout.ts", "import Stripe from 'stripe';\nnew Stripe('key', { timeout: 5000, retry: 3 });"),
    ])
    issues = ExternalIntegrationAuditEngine().audit(project)
    issue = next(i for i in issues if i.id == "external_integration_missing_tests:stripe")
    assert issue.severity == "WARNING"


def test_missing_project_manifest_treats_nothing_as_approved(make_project):
    # No ldcn.project.json at all -- must fail closed (nothing approved), not open.
    project = make_project([("package.json", '{"dependencies":{"stripe":"^14.0.0"}}')])
    issues = ExternalIntegrationAuditEngine().audit(project)
    assert any(i.id == "external_integration_not_opted_in:stripe" for i in issues)


def test_project_without_generated_path_returns_no_issues():
    assert ExternalIntegrationAuditEngine().audit({"project_id": "x", "generated_project_path": None}) == []
