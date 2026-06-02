from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

NodeType = Literal["client", "frontend", "gateway", "backend", "service", "auth", "database", "cache", "queue", "event_bus", "vector_db", "storage", "observability", "deployment", "external_provider"]
EdgeType = Literal["sync", "async", "event", "queue", "cache", "data", "telemetry", "auth", "dependency"]
Burden = Literal["low", "medium", "high", "enterprise"]
RiskLevel = Literal["low", "medium", "high", "critical"]


class ArchitecturalGraphRequest(ApiModel):
    language_id: str = Field(min_length=1)
    framework_id: str = Field(min_length=1)
    architecture_id: str = Field(min_length=1)
    capability_ids: list[str] = Field(default_factory=list)
    business_module_ids: list[str] = Field(default_factory=list)
    infrastructure_ids: list[str] = Field(default_factory=list)


class NodeHealth(ApiModel):
    contractVersion: str
    status: Literal["healthy", "watch", "degraded"]
    summary: str


class NodeRisk(ApiModel):
    contractVersion: str
    level: RiskLevel
    score: int
    warnings: list[str] = Field(default_factory=list)


class NodeReadiness(ApiModel):
    contractVersion: str
    score: int
    status: Literal["ready", "warning", "blocked"]
    recommendations: list[str] = Field(default_factory=list)


class NodeOwnership(ApiModel):
    contractVersion: str
    role: str
    required_skills: list[str] = Field(default_factory=list)
    boundary: str


class ArchitecturalNode(ApiModel):
    contractVersion: str
    id: str
    label: str
    type: NodeType
    category: str
    status: Literal["healthy", "watch", "degraded"]
    burden_score: Burden
    risk_level: RiskLevel
    readiness_score: int
    ownership_role: str
    required_skills: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    health: NodeHealth
    risk: NodeRisk
    readiness: NodeReadiness
    ownership: NodeOwnership


class ArchitecturalEdge(ApiModel):
    contractVersion: str
    id: str
    source_id: str
    target_id: str
    type: EdgeType
    label: str
    animated: bool
    warning: str | None = None


class GraphLayoutPoint(ApiModel):
    node_id: str
    x: int
    y: int
    layer: int


class GraphLayout(ApiModel):
    contractVersion: str
    width: int
    height: int
    direction: Literal["horizontal", "vertical"]
    simplified_mobile: bool
    points: list[GraphLayoutPoint] = Field(default_factory=list)


class ArchitecturalGraph(ApiModel):
    contractVersion: str
    graph_id: str
    architecture_id: str
    nodes: list[ArchitecturalNode] = Field(default_factory=list)
    edges: list[ArchitecturalEdge] = Field(default_factory=list)
    layout: GraphLayout
    warnings: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)


class GraphSnapshot(ApiModel):
    contractVersion: str
    graph: ArchitecturalGraph
    source: Literal["preview", "project_snapshot"]
    generated_at: str
