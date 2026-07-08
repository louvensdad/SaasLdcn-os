from __future__ import annotations

from app.engines.project_manifest_engine import build_project_manifest
from app.schemas.orchestrator import ProjectSpec, SuggestedStack


def _spec(**overrides) -> ProjectSpec:
    defaults: dict = {"raw_intent": "teste", "delivery_type": "web"}
    defaults.update(overrides)
    return ProjectSpec(**defaults)


def test_manifest_stack_and_modules_match_the_spec():
    spec = _spec(
        entities=["User", "Order"],
        core_workflows=["checkout"],
        delivery_type="full_stack",
        suggested_stack=SuggestedStack(language="TypeScript", framework="Next.js", architecture="monolith", runtime="Node.js"),
    )
    manifest = build_project_manifest("proj-1", "My Project", spec, {})
    assert manifest.project_id == "proj-1"
    assert manifest.project_name == "My Project"
    assert manifest.stack.language == "TypeScript"
    assert manifest.stack.framework == "Next.js"
    assert manifest.stack.architecture == "monolith"
    assert manifest.stack.runtime == "Node.js"
    assert manifest.modules.delivery_type == "full_stack"
    assert manifest.modules.entities == ["User", "Order"]
    assert manifest.modules.core_workflows == ["checkout"]


def test_manifest_decisions_are_a_light_summary_of_the_blueprint():
    spec = _spec()
    blueprint = {
        "decisions": [
            {"area": "database", "choice": "PostgreSQL", "justification": "should not leak into the manifest"},
            {"area": "auth", "choice": "JWT"},
        ]
    }
    manifest = build_project_manifest("proj-2", "Proj", spec, blueprint)
    assert [d.model_dump() for d in manifest.decisions] == [
        {"area": "database", "choice": "PostgreSQL"},
        {"area": "auth", "choice": "JWT"},
    ]


def test_manifest_tolerates_missing_or_empty_blueprint():
    spec = _spec()
    assert build_project_manifest("proj-3", "Proj", spec, None).decisions == []
    assert build_project_manifest("proj-4", "Proj", spec, {}).decisions == []


def test_manifest_evidence_files_is_a_fixed_known_list():
    spec = _spec()
    manifest = build_project_manifest("proj-5", "Proj", spec, None)
    assert manifest.evidence_files
    assert "product-completion-report.json" in manifest.evidence_files
    assert "README.md" in manifest.evidence_files
