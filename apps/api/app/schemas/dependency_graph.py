from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

DependencyNodeType = Literal[
    "language",
    "runtime",
    "framework",
    "architecture",
    "capability",
    "business_module",
    "endpoint_group",
    "infrastructure",
    "deployment",
    "observability",
    "security",
    "ai",
    "data",
]

DependencyEdgeType = Literal[
    "requires",
    "recommends",
    "conflicts_with",
    "increases_complexity",
    "reduces_complexity",
    "enables",
    "blocks",
    "scales_with",
    "optional_with",
]

ImpactBand = Literal["low", "medium", "high", "enterprise", "hyperscale"]
RiskSeverity = Literal["info", "warning", "critical"]
MutationCategory = Literal["architecture", "deployment", "infrastructure", "observability", "security", "scalability"]


class DependencyNode(ApiModel):
    contractVersion: str
    id: str
    type: DependencyNodeType
    category: str
    label: str
    description: str
    severity_weight: int
    complexity_weight: int


class DependencyEdge(ApiModel):
    contractVersion: str
    id: str
    source_id: str
    target_id: str
    type: DependencyEdgeType
    label: str
    description: str
    weight: int


class DependencyRule(ApiModel):
    contractVersion: str
    id: str
    label: str
    trigger_node_ids: list[str] = Field(default_factory=list)
    required_node_ids: list[str] = Field(default_factory=list)
    recommended_node_ids: list[str] = Field(default_factory=list)
    optional_node_ids: list[str] = Field(default_factory=list)
    blocked_node_ids: list[str] = Field(default_factory=list)
    conflicting_node_ids: list[str] = Field(default_factory=list)
    edge_type: DependencyEdgeType
    rationale: str


class ArchitectureMutation(ApiModel):
    contractVersion: str
    id: str
    trigger_node_id: str
    category: MutationCategory
    severity: RiskSeverity
    source_value: str
    mutated_value: str
    rationale: str
    related_node_ids: list[str] = Field(default_factory=list)
    required_review: bool


class DependencyPropagation(ApiModel):
    contractVersion: str
    activated_node_ids: list[str] = Field(default_factory=list)
    required_node_ids: list[str] = Field(default_factory=list)
    recommended_node_ids: list[str] = Field(default_factory=list)
    optional_node_ids: list[str] = Field(default_factory=list)
    blocked_node_ids: list[str] = Field(default_factory=list)
    conflicting_node_ids: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    rationale: list[str] = Field(default_factory=list)
    mutations: list[ArchitectureMutation] = Field(default_factory=list)


class ImpactProfile(ApiModel):
    contractVersion: str
    score: int
    infra_complexity: ImpactBand
    deployment_complexity: ImpactBand
    operational_burden: ImpactBand
    scaling_complexity: ImpactBand
    maintenance_cost: ImpactBand
    security_surface: ImpactBand
    learning_curve: ImpactBand
    team_maturity_required: ImpactBand
    rationale: list[str] = Field(default_factory=list)


class ReadinessProfile(ApiModel):
    contractVersion: str
    score: int
    mvp_readiness: int
    production_readiness: int
    enterprise_readiness: int
    scalability_readiness: int
    observability_readiness: int
    security_readiness: int
    missing_requirements: list[str] = Field(default_factory=list)
    blockers: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)


class RiskIssue(ApiModel):
    contractVersion: str
    id: str
    title: str
    severity: RiskSeverity
    summary: str
    related_node_ids: list[str] = Field(default_factory=list)


class RiskProfile(ApiModel):
    contractVersion: str
    score: int
    risk_level: ImpactBand
    issues: list[RiskIssue] = Field(default_factory=list)
    blockers: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    rationale: list[str] = Field(default_factory=list)


class DependencyGraphRequest(ApiModel):
    language_id: str = Field(min_length=1)
    framework_id: str = Field(min_length=1)
    architecture_id: str = Field(min_length=1)
    capability_ids: list[str] = Field(default_factory=list)
    infrastructure_ids: list[str] = Field(default_factory=list)
    archetype_id: str | None = None


class DependencyGraphSnapshot(ApiModel):
    contractVersion: str
    graph_id: str
    language_id: str
    runtime_id: str
    framework_id: str
    architecture_id: str
    architecture_level: str
    archetype_id: str | None = None
    capability_ids: list[str] = Field(default_factory=list)
    infrastructure_ids: list[str] = Field(default_factory=list)
    nodes: list[DependencyNode] = Field(default_factory=list)
    edges: list[DependencyEdge] = Field(default_factory=list)
    rules: list[DependencyRule] = Field(default_factory=list)
    propagation: DependencyPropagation
    impact_profile: ImpactProfile
    readiness_profile: ReadinessProfile
    risk_profile: RiskProfile
    mutations: list[ArchitectureMutation] = Field(default_factory=list)
    generated_at: str
