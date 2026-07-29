from __future__ import annotations

from pydantic import Field

from typing import Any, Literal

from app.schemas.common import ApiModel


class TemplateBlueprint(ApiModel):
    summary: str
    modules: list[str]
    requiredFiles: list[str]
    forbiddenFiles: list[str]
    notes: list[str] = Field(default_factory=list)


class TemplatePreview(ApiModel):
    title: str
    description: str
    highlights: list[str]


class Template(ApiModel):
    contractVersion: str
    templateId: str
    templateCode: str
    name: str
    description: str
    stackId: str
    archetypeIds: list[str] = Field(default_factory=list)
    supportedLocales: list[str]
    status: str
    visibility: str
    blueprint: TemplateBlueprint
    preview: TemplatePreview
    defaultAnswers: dict[str, Any]
    promptSeed: str
    tags: list[str]


class TemplateChangelogEntry(ApiModel):
    version: str
    date: str
    changes: list[str] = Field(default_factory=list)


class TemplateMarketplaceItem(ApiModel):
    contractVersion: str
    id: str
    name: str
    description: str
    version: str
    category: str
    supported_languages: list[str] = Field(default_factory=list)
    supported_frameworks: list[str] = Field(default_factory=list)
    supported_architectures: list[str] = Field(default_factory=list)
    supported_archetypes: list[str] = Field(default_factory=list)
    supported_locales: list[str] = Field(default_factory=list)
    fallback_locale: str = "en-US"
    capabilities: list[str] = Field(default_factory=list)
    complexity: Literal["low", "medium", "high"]
    maturity: Literal["experimental", "stable", "mature"]
    preview_images: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    changelog: list[TemplateChangelogEntry] = Field(default_factory=list)


class TemplateCompatibilityRequest(ApiModel):
    language_id: str | None = None
    framework_id: str | None = None
    architecture_id: str | None = None
    archetype_id: str | None = None
    capability_ids: list[str] = Field(default_factory=list)


class TemplateCompatibilityResponse(ApiModel):
    contractVersion: str
    template_id: str
    compatible: bool
    score: int
    matched: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    maturity_verified: bool


class TemplateCatalogResponse(ApiModel):
    contractVersion: str
    templates: list[TemplateMarketplaceItem] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)


class TemplateRecommendationResponse(ApiModel):
    contractVersion: str
    recommendations: list[TemplateMarketplaceItem] = Field(default_factory=list)
    compatibility: list[TemplateCompatibilityResponse] = Field(default_factory=list)
