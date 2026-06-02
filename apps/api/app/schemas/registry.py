from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.stack import Stack


class Language(ApiModel):
    contractVersion: str
    id: str
    name: str
    description: str
    ecosystem: str
    supported_runtimes: list[str]
    supported_frameworks: list[str]
    supported_architectures: list[str]
    enterprise_score: int
    learning_curve: str
    performance_profile: str
    scalability_profile: str


class Runtime(ApiModel):
    contractVersion: str
    id: str
    name: str
    language_id: str
    description: str
    supported_frameworks: list[str]
    deployment_profiles: list[str]
    performance_profile: str


class Framework(ApiModel):
    contractVersion: str
    id: str
    name: str
    language_id: str
    runtime_id: str
    framework_type: str
    description: str
    architecture_support: list[str]
    archetype_support: list[str]
    capability_support: list[str]
    enterprise_score: int
    maturity_level: str
    recommended_use_cases: list[str]


class ArchetypeComplexityRange(ApiModel):
    minimum: int
    maximum: int


class Archetype(ApiModel):
    contractVersion: str
    id: str
    name: str
    description: str
    category: str
    supported_frameworks: list[str]
    recommended_frameworks: list[str]
    default_capabilities: list[str]
    recommended_business_modules: list[str]
    default_endpoints: list[str]
    supported_architectures: list[str]
    supported_locales: list[str]
    complexity_range: ArchetypeComplexityRange
    preview_type: str


class Capability(ApiModel):
    contractVersion: str
    id: str
    name: str
    description: str
    category: str
    supported_frameworks: list[str]
    requires: list[str]
    conflicts_with: list[str]
    recommended_endpoints: list[str]
    architecture_ids: list[str]
    security_impact: str
    generation_impact: str


class BusinessModule(ApiModel):
    contractVersion: str
    id: str
    name: str
    description: str
    category: str
    recommended_capabilities: list[str]
    default_endpoints: list[str]
    required_fields: list[str]
    optional_fields: list[str]
    supported_frameworks: list[str]


class Endpoint(ApiModel):
    contractVersion: str
    id: str
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"]
    path: str
    group: str
    description: str
    business_module_id: str | None = None
    required_capabilities: list[str]
    request_schema_hint: str
    response_schema_hint: str
    security_level: str
    supported_frameworks: list[str]
    supported_architectures: list[str]


class Architecture(ApiModel):
    contractVersion: str
    id: str
    name: str
    description: str
    complexity_level: str
    supported_frameworks: list[str]
    required_capabilities: list[str]
    recommended_capabilities: list[str]
    scalability_profile: str
    deployment_complexity: str


class CompatibilityRule(ApiModel):
    contractVersion: str
    id: str
    source_type: str
    source_id: str
    target_type: str
    target_id: str
    rule_type: str
    severity: str
    message: str
    suggestion: str | None = None


class RegistryValidationSelection(ApiModel):
    language_id: str
    runtime_id: str
    framework_id: str
    architecture_id: str
    archetype_id: str
    capability_ids: list[str] = Field(default_factory=list)
    business_module_ids: list[str] = Field(default_factory=list)
    endpoint_ids: list[str] = Field(default_factory=list)


class RegistryValidationMessage(ApiModel):
    code: str
    message: str
    suggestion: str | None = None
    related_ids: list[str] = Field(default_factory=list)


class RegistryValidationResponse(ApiModel):
    valid: bool
    errors: list[RegistryValidationMessage] = Field(default_factory=list)
    warnings: list[RegistryValidationMessage] = Field(default_factory=list)
    recommended_additions: list[str] = Field(default_factory=list)
    resolved_blueprint_summary: dict[str, Any] = Field(default_factory=dict)


class RegistryCatalogResponse(ApiModel):
    stacks: list[Stack]
    languages: list[Language]
    runtimes: list[Runtime]
    frameworks: list[Framework]
    architectures: list[Architecture]
    archetypes: list[Archetype]
    capabilities: list[Capability]
    business_modules: list[BusinessModule]
    endpoints: list[Endpoint]
