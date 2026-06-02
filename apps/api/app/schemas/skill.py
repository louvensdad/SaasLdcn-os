from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.schemas.common import ApiModel

SkillCategory = Literal["architecture", "planning", "generation", "support"]
SkillMaturity = Literal["foundation", "stable", "reserved"]
SkillExecutionMode = Literal["read_only", "manual_assist", "local_safe"]


class SkillDependency(ApiModel):
    contractVersion: str
    id: str
    label: str
    kind: Literal["endpoint", "registry", "template", "project", "report"]
    required: bool


class SkillMetadata(ApiModel):
    contractVersion: str
    category: SkillCategory
    maturity: SkillMaturity
    execution_mode: SkillExecutionMode
    safe: bool
    no_ai: bool
    no_agents: bool
    no_external_integrations: bool


class SkillDefinition(ApiModel):
    contractVersion: str
    id: str
    name: str
    description: str
    category: SkillCategory
    tags: list[str] = Field(default_factory=list)
    requirements: list[str] = Field(default_factory=list)
    examples: list[str] = Field(default_factory=list)
    dependencies: list[SkillDependency] = Field(default_factory=list)
    metadata: SkillMetadata


class SkillRecommendation(ApiModel):
    contractVersion: str
    skill_id: str
    score: int
    reason: str
    unlocked: bool


class SkillPreview(ApiModel):
    contractVersion: str
    skill_id: str
    title: str
    summary: str
    steps: list[str] = Field(default_factory=list)
    safety_notes: list[str] = Field(default_factory=list)
    execution_enabled: bool = False


class SkillCatalogResponse(ApiModel):
    contractVersion: str
    skills: list[SkillDefinition] = Field(default_factory=list)
    categories: list[SkillCategory] = Field(default_factory=list)


class SkillPreviewRequest(ApiModel):
    skill_id: str
    project_id: str | None = None
    context: dict[str, Any] = Field(default_factory=dict)
