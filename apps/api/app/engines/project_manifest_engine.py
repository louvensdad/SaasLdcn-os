from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.schemas.orchestrator import ProjectSpec
from app.schemas.project_manifest import (
    ProjectManifest,
    ProjectManifestDecision,
    ProjectManifestModules,
    ProjectManifestStack,
)

# Same literal filenames engineering_kernel_engine._FILE_EVIDENCE and
# modernization_plan_engine's devops phase already use -- not invented here,
# just the fixed set of files this generation pipeline is known to produce.
_KNOWN_EVIDENCE_FILES = (
    "product-completion-report.json",
    "endpoint-ui-coverage.json",
    "ui-depth-score.json",
    "README.md",
    ".env.example",
)


def build_project_manifest(
    project_id: str, project_name: str, spec: ProjectSpec, blueprint: dict[str, Any] | None
) -> ProjectManifest:
    stack = ProjectManifestStack(
        language=spec.suggested_stack.language,
        framework=spec.suggested_stack.framework,
        architecture=spec.suggested_stack.architecture,
        runtime=spec.suggested_stack.runtime,
    )
    modules = ProjectManifestModules(
        delivery_type=spec.delivery_type,
        entities=list(spec.entities),
        core_workflows=list(spec.core_workflows),
    )
    decisions = [
        ProjectManifestDecision(area=str(item.get("area", "")), choice=str(item.get("choice", "")))
        for item in ((blueprint or {}).get("decisions") or [])
    ]
    return ProjectManifest(
        project_id=project_id,
        project_name=project_name,
        stack=stack,
        modules=modules,
        decisions=decisions,
        evidence_files=list(_KNOWN_EVIDENCE_FILES),
        generated_at=datetime.now(UTC).replace(microsecond=0).isoformat(),
    )
