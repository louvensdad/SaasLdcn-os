from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

InfrastructureCategory = Literal[
    "database",
    "cache",
    "queue",
    "object_storage",
    "auth_provider",
    "observability",
    "deployment",
    "containerization",
    "api_gateway",
    "search",
    "vector_database",
    "email_provider",
    "payment_provider",
]

InfrastructureProvider = Literal[
    "open_source",
    "self_hosted",
    "cloud_native",
    "aws",
    "cloudflare",
    "vercel",
    "railway",
    "flyio",
    "keycloak",
    "auth0",
    "clerk",
    "nextauth",
    "prometheus",
    "grafana",
    "opentelemetry",
    "sentry",
    "nginx",
    "spring_cloud",
    "kong",
    "traefik",
    "resend",
    "sendgrid",
    "stripe",
    "mercado_pago",
    "postgresql",
    "mysql",
    "mongodb",
    "redis",
    "rabbitmq",
    "kafka",
    "sqlite",
    "qdrant",
    "pinecone",
    "elasticsearch",
    "meilisearch",
    "docker",
    "kubernetes",
    "smtp",
    "local",
    "generic",
]


class InfrastructureComponent(ApiModel):
    contractVersion: str
    id: str
    category: InfrastructureCategory
    name: str
    summary: str
    provider: InfrastructureProvider
    best_for: list[str] = Field(default_factory=list)
    avoid_when: list[str] = Field(default_factory=list)
    tradeoffs: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class InfrastructureCompatibilityRule(ApiModel):
    contractVersion: str
    id: str
    component_id: str
    related_component_ids: list[str] = Field(default_factory=list)
    condition: str
    rationale: str
    severity: Literal["info", "warning", "critical"]


class InfrastructureRecommendation(ApiModel):
    contractVersion: str
    recommended: list[str] = Field(default_factory=list)
    required: list[str] = Field(default_factory=list)
    optional: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    rationale: list[str] = Field(default_factory=list)


class InfrastructureProfile(ApiModel):
    contractVersion: str
    architecture_level: str
    selected_component_ids: list[str] = Field(default_factory=list)
    recommended_component_ids: list[str] = Field(default_factory=list)
    required_component_ids: list[str] = Field(default_factory=list)
    optional_component_ids: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    rationale: list[str] = Field(default_factory=list)


class InfrastructureRecommendationSelection(ApiModel):
    language_id: str = Field(min_length=1)
    framework_id: str = Field(min_length=1)
    architecture_id: str = Field(min_length=1)
    archetype_id: str = Field(min_length=1)
    capability_ids: list[str] = Field(default_factory=list)
    architecture_level: str = Field(min_length=1)
