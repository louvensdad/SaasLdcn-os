from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

EngineeringBand = Literal["low", "medium", "high", "enterprise"]
TeamSeniority = Literal["mid", "senior", "senior_plus", "staff"]
EngineeringRiskSeverity = Literal["info", "warning", "critical"]
DeliveryTarget = Literal["prototype", "mvp", "production_ready", "enterprise_ready"]


class EngineeringReadinessRequest(ApiModel):
    language_id: str = Field(min_length=1)
    framework_id: str = Field(min_length=1)
    architecture_id: str = Field(min_length=1)
    capability_ids: list[str] = Field(default_factory=list)
    infrastructure_ids: list[str] = Field(default_factory=list)


class SkillRequirement(ApiModel):
    contractVersion: str
    id: str
    label: str
    priority: Literal["required", "recommended", "optional"]
    rationale: str


class TeamRole(ApiModel):
    contractVersion: str
    id: str
    title: str
    recommended_level: TeamSeniority
    required_skills: list[SkillRequirement] = Field(default_factory=list)
    optional_skills: list[SkillRequirement] = Field(default_factory=list)


class TeamRecommendation(ApiModel):
    contractVersion: str
    team_size: int
    required_seniority: TeamSeniority
    roles: list[TeamRole] = Field(default_factory=list)
    required_expertise: list[SkillRequirement] = Field(default_factory=list)
    rationale: list[str] = Field(default_factory=list)


class OperationalBurden(ApiModel):
    contractVersion: str
    score: int
    level: EngineeringBand
    service_ownership: int
    deployment_burden: int
    observability_burden: int
    incident_burden: int
    maintenance_effort: EngineeringBand
    signals: list[str] = Field(default_factory=list)


class DeliveryComplexity(ApiModel):
    contractVersion: str
    score: int
    level: EngineeringBand
    maintenance_effort: EngineeringBand
    onboarding_effort: EngineeringBand
    deployment_burden: EngineeringBand
    complexity_drivers: list[str] = Field(default_factory=list)


class LearningCurveProfile(ApiModel):
    contractVersion: str
    score: int
    level: EngineeringBand
    onboarding_complexity: EngineeringBand
    ramp_up_weeks: int
    learning_focus: list[str] = Field(default_factory=list)


class ProductionReadiness(ApiModel):
    contractVersion: str
    score: int
    readiness: DeliveryTarget
    production_ready: bool
    enterprise_ready: bool
    deployment_readiness: int
    operational_readiness: int
    team_readiness: int
    missing_baselines: list[str] = Field(default_factory=list)


class EngineeringRisk(ApiModel):
    contractVersion: str
    id: str
    title: str
    severity: EngineeringRiskSeverity
    category: Literal["production", "operations", "maintenance", "scaling", "team"]
    summary: str
    related_ids: list[str] = Field(default_factory=list)


class DeliveryPhase(ApiModel):
    id: str
    label: str
    weeks: int


class DeliveryEstimate(ApiModel):
    contractVersion: str
    target: DeliveryTarget
    estimated_weeks: int
    confidence: EngineeringBand
    complexity: DeliveryComplexity
    phases: list[DeliveryPhase] = Field(default_factory=list)


class EngineeringReadinessProfile(ApiModel):
    contractVersion: str
    overall_readiness: int
    team_size: int
    recommended_roles: list[TeamRole] = Field(default_factory=list)
    required_seniority: TeamSeniority
    onboarding_complexity: EngineeringBand
    production_risk: int
    operational_risk: int
    maintenance_risk: int
    scaling_risk: int
    delivery_estimate: DeliveryEstimate
    learning_curve: LearningCurveProfile
    enterprise_readiness: int
    deployment_readiness: int
    team_recommendation: TeamRecommendation
    operational_burden: OperationalBurden
    delivery_complexity: DeliveryComplexity
    production_readiness: ProductionReadiness
    engineering_risks: list[EngineeringRisk] = Field(default_factory=list)
