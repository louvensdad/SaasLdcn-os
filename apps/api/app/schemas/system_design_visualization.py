from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

NodeType = Literal[
    "client", "frontend", "backend", "gateway", "auth", "service", "database", "cache",
    "queue", "observability", "vector_db", "storage", "deployment", "external_provider",
]
EdgeType = Literal["sync", "async", "queue", "auth", "cache", "data", "dependency", "event", "observability"]
Band = Literal["low", "medium", "high", "enterprise"]
Severity = Literal["info", "warning", "critical"]


class VisualizationRequest(ApiModel):
    language_id: str = Field(min_length=1)
    framework_id: str = Field(min_length=1)
    architecture_id: str = Field(min_length=1)
    capability_ids: list[str] = Field(default_factory=list)
    infrastructure_ids: list[str] = Field(default_factory=list)


class ServiceNode(ApiModel):
    contractVersion: str
    id: str
    label: str
    type: NodeType
    zone: str
    ownership: str
    detail: str
    emphasis: Literal["primary", "supporting", "risk"]


class InfrastructureNode(ApiModel):
    contractVersion: str
    id: str
    label: str
    type: NodeType
    provider: Literal["selected", "derived", "external"]
    ownership: str
    detail: str


class VisualizationEdge(ApiModel):
    contractVersion: str
    id: str
    source_id: str
    target_id: str
    type: EdgeType
    label: str
    animated: bool


class ArchitectureTopology(ApiModel):
    contractVersion: str
    architecture_id: str
    complexity: Band
    nodes: list[ServiceNode] = Field(default_factory=list)
    edges: list[VisualizationEdge] = Field(default_factory=list)
    zones: list[str] = Field(default_factory=list)
    signals: list[str] = Field(default_factory=list)


class InfrastructureTopology(ApiModel):
    contractVersion: str
    nodes: list[InfrastructureNode] = Field(default_factory=list)
    edges: list[VisualizationEdge] = Field(default_factory=list)
    burden: Band
    ownership_signals: list[str] = Field(default_factory=list)


class RuntimeFlow(ApiModel):
    contractVersion: str
    nodes: list[ServiceNode] = Field(default_factory=list)
    edges: list[VisualizationEdge] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)
    mode: Literal["simple", "bounded", "distributed", "evented"]


class DependencyVisualization(ApiModel):
    contractVersion: str
    nodes: list[ServiceNode] = Field(default_factory=list)
    edges: list[VisualizationEdge] = Field(default_factory=list)
    chains: list[str] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)
    burden_signals: list[str] = Field(default_factory=list)


class RiskZone(ApiModel):
    contractVersion: str
    id: str
    label: str
    severity: Severity
    category: str
    summary: str
    related_node_ids: list[str] = Field(default_factory=list)


class ReadinessZone(ApiModel):
    contractVersion: str
    id: str
    label: str
    score: int
    status: Literal["healthy", "warning", "blocked"]
    summary: str


class TeamTopology(ApiModel):
    contractVersion: str
    nodes: list[ServiceNode] = Field(default_factory=list)
    edges: list[VisualizationEdge] = Field(default_factory=list)
    maturity: str
    coordination: str
    ownership_boundaries: list[str] = Field(default_factory=list)


class DeploymentTopology(ApiModel):
    contractVersion: str
    mode: Literal["local", "docker", "kubernetes", "edge", "serverless", "hybrid"]
    nodes: list[InfrastructureNode] = Field(default_factory=list)
    edges: list[VisualizationEdge] = Field(default_factory=list)
    deployment_burden: int
    operational_overhead: str
    scaling_impact: str


class VisualizationSnapshot(ApiModel):
    contractVersion: str
    architecture_topology: ArchitectureTopology
    infrastructure_topology: InfrastructureTopology
    runtime_flow: RuntimeFlow
    dependency_visualization: DependencyVisualization
    risk_zones: list[RiskZone] = Field(default_factory=list)
    readiness_zones: list[ReadinessZone] = Field(default_factory=list)
    team_topology: TeamTopology
    deployment_topology: DeploymentTopology
