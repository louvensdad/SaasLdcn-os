from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.schemas.architectural_graph import GraphSnapshot
from app.schemas.blueprint import ProjectBlueprint
from app.schemas.common import ApiModel
from app.schemas.dependency_graph import ImpactProfile
from app.schemas.engineering_readiness import EngineeringReadinessProfile
from app.schemas.gatekeeper import GatekeeperReport
from app.schemas.infrastructure import InfrastructureRecommendation
from app.schemas.project import ProjectRecord
from app.schemas.prompt_master import PromptMasterDocument


class GenerationHandoffPreviewRequest(ApiModel):
    project_id: str = Field(min_length=1)


class HandoffChecklist(ApiModel):
    contractVersion: str
    id: str
    label: str
    required: bool
    status: Literal["passed", "failed", "warning"]
    summary: str


class HandoffArtifact(ApiModel):
    contractVersion: str
    id: str
    kind: Literal[
        "project_record",
        "blueprint_snapshot",
        "prompt_master_snapshot",
        "gatekeeper_snapshot",
        "architectural_graph_snapshot",
        "infrastructure_recommendations",
        "dependency_impact",
        "engineering_readiness",
        "selected_scope",
    ]
    label: str
    included: bool
    source: str
    summary: str
    item_count: int | None = None


class HandoffBlocker(ApiModel):
    contractVersion: str
    code: str
    source: str
    message: str
    severity: Literal["critical"] = "critical"
    related_ids: list[str] = Field(default_factory=list)


class HandoffWarning(ApiModel):
    contractVersion: str
    code: str
    source: str
    message: str
    severity: Literal["warning", "info"] = "warning"
    related_ids: list[str] = Field(default_factory=list)


class HandoffTrace(ApiModel):
    contractVersion: str
    generated_at: str
    project_id: str
    operations: list[str] = Field(default_factory=list)
    included_artifact_ids: list[str] = Field(default_factory=list)
    omitted_sensitive_fields: list[str] = Field(default_factory=list)
    contains_secrets: Literal[False] = False


class HandoffSelectedScope(ApiModel):
    endpoints: list[str] = Field(default_factory=list)
    modules: list[str] = Field(default_factory=list)
    capabilities: list[str] = Field(default_factory=list)


class GenerationHandoffPackage(ApiModel):
    contractVersion: str
    handoff_id: str
    project_id: str
    project_name: str
    handoff_readiness: Literal["ready", "blocked", "incomplete"]
    project_record: ProjectRecord
    blueprint_snapshot: ProjectBlueprint | None = None
    prompt_master_snapshot: PromptMasterDocument | None = None
    gatekeeper_snapshot: GatekeeperReport | None = None
    architectural_graph_snapshot: GraphSnapshot | None = None
    infrastructure_recommendations: InfrastructureRecommendation | None = None
    dependency_impact: ImpactProfile | None = None
    engineering_readiness: EngineeringReadinessProfile | None = None
    selected: HandoffSelectedScope
    checklist: list[HandoffChecklist] = Field(default_factory=list)
    artifacts: list[HandoffArtifact] = Field(default_factory=list)
    blockers: list[HandoffBlocker] = Field(default_factory=list)
    warnings: list[HandoffWarning] = Field(default_factory=list)
    trace: HandoffTrace
    generation_disabled: Literal[True] = True
    metadata: dict[str, Any] = Field(default_factory=dict)
