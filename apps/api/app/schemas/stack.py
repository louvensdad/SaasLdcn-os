from __future__ import annotations

from app.schemas.common import ApiModel


class StackFeature(ApiModel):
    key: str
    label: str
    description: str


class StackConstraint(ApiModel):
    key: str
    level: str
    message: str


class StackWizardProfile(ApiModel):
    profileId: str
    entryStep: str
    recommendedFlow: list[str]
    validationMode: str


class StackTemplateCompatibility(ApiModel):
    compatibleTemplateIds: list[str]
    defaultTemplateId: str | None = None
    supportsBlankStart: bool


class StackGatekeeperProfile(ApiModel):
    profileId: str
    releaseStage: str
    blockedCapabilities: list[str]
    requiredChecks: list[str]


class Stack(ApiModel):
    contractVersion: str
    id: str
    name: str
    category: str
    status: str
    description: str
    supported_locales: list[str]
    supported_generation_modes: list[str]
    allowed_architectures: list[str]
    required_fields: list[str]
    optional_fields: list[str]
    features: list[StackFeature]
    constraints: list[StackConstraint]
    wizard_profile: StackWizardProfile
    template_compatibility: StackTemplateCompatibility
    gatekeeper_profile: StackGatekeeperProfile
