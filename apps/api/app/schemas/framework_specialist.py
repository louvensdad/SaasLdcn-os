from __future__ import annotations

from pydantic import Field

from app.schemas.common import ApiModel


class FrameworkRecommendation(ApiModel):
    contractVersion: str
    id: str
    title: str
    summary: str
    priority: str


class FrameworkArchitectureGuidance(ApiModel):
    contractVersion: str
    architecture_id: str
    architecture_name: str
    summary: str
    rationale: str
    tradeoff: str


class FrameworkCapabilityGuidance(ApiModel):
    contractVersion: str
    capability_id: str
    capability_name: str
    summary: str
    rationale: str
    priority: str


class FrameworkEndpointGuidance(ApiModel):
    contractVersion: str
    endpoint_group: str
    title: str
    summary: str
    recommended_endpoints: list[str] = Field(default_factory=list)


class FrameworkTradeoff(ApiModel):
    contractVersion: str
    title: str
    summary: str
    impact: str


class FrameworkReadinessProfile(ApiModel):
    contractVersion: str
    level: str
    label: str
    summary: str
    signals: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)
    score: int


class FrameworkSpecialistProfile(ApiModel):
    contractVersion: str
    framework_id: str
    language_id: str
    runtime_id: str
    framework_name: str
    specialist_label: str
    summary: str
    best_for: list[str] = Field(default_factory=list)
    avoid_when: list[str] = Field(default_factory=list)
    recommended_architectures: list[FrameworkArchitectureGuidance] = Field(default_factory=list)
    supported_archetypes: list[str] = Field(default_factory=list)
    recommended_capabilities: list[FrameworkCapabilityGuidance] = Field(default_factory=list)
    recommended_business_modules: list[str] = Field(default_factory=list)
    recommended_endpoint_groups: list[FrameworkEndpointGuidance] = Field(default_factory=list)
    tradeoffs: list[FrameworkTradeoff] = Field(default_factory=list)
    testing_strategy: list[str] = Field(default_factory=list)
    security_baseline: list[str] = Field(default_factory=list)
    deployment_baseline: list[str] = Field(default_factory=list)
    infrastructure_baseline: list[str] = Field(default_factory=list)
    observability_baseline: list[str] = Field(default_factory=list)
    common_pitfalls: list[str] = Field(default_factory=list)
    complexity_notes: list[str] = Field(default_factory=list)
    readiness_profile: FrameworkReadinessProfile
