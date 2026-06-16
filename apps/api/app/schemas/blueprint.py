from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.dependency_graph import DependencyGraphSnapshot
from app.schemas.localization import GeneratedProjectLocaleProfile
from app.schemas.registry import Architecture, Archetype, BusinessModule, Capability, Endpoint, Framework, Language, Runtime


class ProjectRequirements(ApiModel):
    project_goal: str = ""
    business_context: str = ""
    target_users: list[str] = Field(default_factory=list)
    business_rules: list[str] = Field(default_factory=list)
    entities: list[str] = Field(default_factory=list)
    workflows: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    delivery_target: Literal["zip", "github", "gitlab", "both"] | None = None


class BlueprintPreviewRequest(ApiModel):
    project_name: str = Field(min_length=1)
    language_id: str = Field(min_length=1)
    runtime_id: str = Field(min_length=1)
    framework_id: str = Field(min_length=1)
    architecture_id: str = Field(min_length=1)
    archetype_id: str = Field(min_length=1)
    capability_ids: list[str] = Field(default_factory=list)
    business_module_ids: list[str] = Field(default_factory=list)
    endpoint_ids: list[str] = Field(default_factory=list)
    infrastructure_component_ids: list[str] = Field(default_factory=list)
    locale: str = Field(min_length=1)
    generation_mode: str = Field(min_length=1)
    project_requirements: ProjectRequirements = Field(default_factory=ProjectRequirements)


class BlueprintTechnologyGraph(ApiModel):
    language: Language
    runtime: Runtime
    framework: Framework
    architecture: Architecture


class BlueprintArchitectureProfile(ApiModel):
    architecture_id: str
    complexity_level: str
    deployment_complexity: str
    scalability_profile: str
    required_infrastructure: list[str] = Field(default_factory=list)
    recommended_patterns: list[str] = Field(default_factory=list)


class BlueprintArchetypeProfile(ApiModel):
    archetype_id: str
    name: str
    category: str
    preview_type: str
    supported_locales: list[str] = Field(default_factory=list)


class BlueprintComplexityProfile(ApiModel):
    overall_score: int
    learning_curve: Literal["low", "medium", "high", "enterprise", "hyperscale"]
    implementation_effort: Literal["low", "medium", "high", "enterprise", "hyperscale"]
    infrastructure_cost: Literal["low", "medium", "high", "enterprise", "hyperscale"]
    maintenance_cost: Literal["low", "medium", "high", "enterprise", "hyperscale"]
    team_size_recommendation: str
    risk_level: Literal["low", "medium", "high", "enterprise", "hyperscale"]


class BlueprintValidationIssue(ApiModel):
    code: str
    message: str
    related_item_ids: list[str] = Field(default_factory=list)


class BlueprintValidation(ApiModel):
    valid: bool
    errors: list[BlueprintValidationIssue] = Field(default_factory=list)
    warnings: list[BlueprintValidationIssue] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)


class BlueprintRecommendation(ApiModel):
    type: Literal["capability", "architecture", "operations", "security", "locale", "delivery", "module", "endpoint"]
    message: str
    severity: Literal["info", "warning", "critical"]
    related_item_id: str | None = None


class BlueprintInfrastructureProfile(ApiModel):
    architecture_level: str
    selected_component_ids: list[str] = Field(default_factory=list)
    recommended_component_ids: list[str] = Field(default_factory=list)
    required_component_ids: list[str] = Field(default_factory=list)
    optional_component_ids: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    rationale: list[str] = Field(default_factory=list)


class ProjectBlueprint(ApiModel):
    blueprint_id: str
    project_name: str
    locale: str
    locale_profile: GeneratedProjectLocaleProfile = Field(default_factory=GeneratedProjectLocaleProfile)
    generation_mode: str
    project_requirements: ProjectRequirements = Field(default_factory=ProjectRequirements)
    technology_graph: BlueprintTechnologyGraph
    architecture_profile: BlueprintArchitectureProfile
    archetype_profile: BlueprintArchetypeProfile
    infrastructure_profile: BlueprintInfrastructureProfile
    capabilities: list[Capability] = Field(default_factory=list)
    business_modules: list[BusinessModule] = Field(default_factory=list)
    endpoints: list[Endpoint] = Field(default_factory=list)
    complexity_profile: BlueprintComplexityProfile
    validation: BlueprintValidation
    recommendations: list[BlueprintRecommendation] = Field(default_factory=list)
    dependency_graph_snapshot: DependencyGraphSnapshot | None = None
    generated_at: str
