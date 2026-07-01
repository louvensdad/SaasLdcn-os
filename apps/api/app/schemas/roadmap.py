from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

RoadmapStatus = Literal["IMPLEMENTED", "IN_PROGRESS", "PLANNED", "FUTURE", "ARCHIVED"]
RoadmapPriority = Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]
RoadmapMaturity = Literal["PROTOTYPE", "ALPHA", "BETA", "PRODUCTION_READY", "ENTERPRISE"]
RoadmapRisk = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
RoadmapReleaseStatus = Literal["DELIVERED", "ACTIVE", "PLANNED"]
RoadmapCategory = Literal[
    "module",
    "engine",
    "registry",
    "visualization",
    "template",
    "skill",
    "extension",
    "agent",
    "infrastructure",
    "backend",
    "frontend",
    "ai",
    "security",
    "deploy",
    "architecture",
    "documentation",
    "laboratory",
]


class RoadmapRelease(ApiModel):
    contractVersion: str
    id: str
    title: str
    date: str
    status: RoadmapReleaseStatus
    progress: int = Field(ge=0, le=100)
    features: list[str] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)


class RoadmapTimelineStep(ApiModel):
    contractVersion: str
    id: str
    title: str
    status: RoadmapStatus
    description: str
    dependencies: list[str] = Field(default_factory=list)
    engines: list[str] = Field(default_factory=list)
    apis: list[str] = Field(default_factory=list)
    documentation: list[str] = Field(default_factory=list)


class RoadmapDependencyEdge(ApiModel):
    contractVersion: str
    source: str
    target: str
    kind: Literal["dependency", "impact"]
    impact: str


class RoadmapGauge(ApiModel):
    contractVersion: str
    id: str
    label: str
    value: int = Field(ge=0, le=100)
    status: Literal["healthy", "warning", "blocked"]
    basis: str


class RoadmapMetric(ApiModel):
    contractVersion: str
    id: str
    label: str
    value: str
    detail: str


class RoadmapSprint(ApiModel):
    contractVersion: str
    id: str
    title: str
    status: Literal["ACTIVE", "PLANNED"]
    progress: int = Field(ge=0, le=100)
    tasks: int = Field(ge=0)
    completed: int = Field(ge=0)
    in_progress: int = Field(ge=0)


class RoadmapItem(ApiModel):
    contractVersion: str
    id: str
    title: str
    category: RoadmapCategory
    status: RoadmapStatus
    summary: str
    progress: int = Field(ge=0, le=100, default=0)
    dependencies: list[str] = Field(default_factory=list)
    release: str = "unassigned"
    updated_at: str = ""
    owner: str = "Platform"
    priority: RoadmapPriority = "MEDIUM"
    maturity: RoadmapMaturity = "PROTOTYPE"
    risk: RoadmapRisk = "MEDIUM"
    risk_basis: list[str] = Field(default_factory=list)
    engines: list[str] = Field(default_factory=list)
    apis: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    contracts: list[str] = Field(default_factory=list)
    documentation: list[str] = Field(default_factory=list)
    impact: str = "Impacto nao informado pelo roadmap."
    tags: list[str] = Field(default_factory=list)


class RoadmapResponse(ApiModel):
    contractVersion: str
    items: list[RoadmapItem] = Field(default_factory=list)
    statuses: list[RoadmapStatus] = Field(default_factory=list)
    releases: list[RoadmapRelease] = Field(default_factory=list)
    platform_timeline: list[RoadmapTimelineStep] = Field(default_factory=list)
    dependency_edges: list[RoadmapDependencyEdge] = Field(default_factory=list)
    impact_edges: list[RoadmapDependencyEdge] = Field(default_factory=list)
    executive_health: list[RoadmapGauge] = Field(default_factory=list)
    coverage: list[RoadmapGauge] = Field(default_factory=list)
    platform_metrics: list[RoadmapMetric] = Field(default_factory=list)
    statistics: list[RoadmapMetric] = Field(default_factory=list)
    sprints: list[RoadmapSprint] = Field(default_factory=list)
