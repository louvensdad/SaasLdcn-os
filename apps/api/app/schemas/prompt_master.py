from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from app.schemas.blueprint import ProjectBlueprint
from app.schemas.common import ApiModel
from app.schemas.localization import GeneratedProjectLocaleProfile


class PromptMasterPreviewRequest(ApiModel):
    blueprint: ProjectBlueprint | None = None
    blueprint_id: str | None = None

    @model_validator(mode="after")
    def validate_blueprint_source(self) -> "PromptMasterPreviewRequest":
        if self.blueprint is not None:
            return self
        if self.blueprint_id and self.blueprint_id.strip():
            return self
        raise ValueError("A blueprint payload or blueprint_id is required.")


class PromptMasterSection(ApiModel):
    id: Literal[
        "product_intent",
        "technology_graph",
        "architecture_profile",
        "business_modules",
        "endpoint_plan",
        "capability_plan",
        "security_requirements",
        "data_model_hints",
        "testing_requirements",
        "documentation_requirements",
        "quality_gates",
        "forbidden_decisions",
        "generation_constraints",
        "locale_language_rules",
        "trace",
    ]
    title: str
    summary: str
    content: str
    bullets: list[str] = Field(default_factory=list)


class PromptMasterValidationIssue(ApiModel):
    code: str
    message: str
    related_section_ids: list[str] = Field(default_factory=list)


class PromptMasterValidation(ApiModel):
    valid: bool
    errors: list[PromptMasterValidationIssue] = Field(default_factory=list)
    warnings: list[PromptMasterValidationIssue] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)


class PromptMasterVersion(ApiModel):
    document_version: str
    engine_version: str
    blueprint_contract_version: str | None = None
    generated_at: str


class PromptMasterTraceSelection(ApiModel):
    language_id: str
    runtime_id: str
    framework_id: str
    architecture_id: str
    archetype_id: str
    capability_ids: list[str] = Field(default_factory=list)
    business_module_ids: list[str] = Field(default_factory=list)
    endpoint_ids: list[str] = Field(default_factory=list)


class PromptMasterTrace(ApiModel):
    blueprint_id: str
    source_selection_ids: PromptMasterTraceSelection
    included_sections: list[str] = Field(default_factory=list)
    redacted_fields: list[str] = Field(default_factory=list)
    contains_secrets: bool


class PromptMasterDocument(ApiModel):
    prompt_master_id: str
    blueprint_id: str
    project_name: str
    locale: str
    locale_profile: GeneratedProjectLocaleProfile = Field(default_factory=GeneratedProjectLocaleProfile)
    generation_mode: str
    source_blueprint_valid: bool
    version: PromptMasterVersion
    validation: PromptMasterValidation
    sections: list[PromptMasterSection] = Field(default_factory=list)
    trace: PromptMasterTrace
    compiled_prompt: str
    generated_at: str
