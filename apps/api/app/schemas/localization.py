from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

LocaleCode = Literal["pt-BR", "en-US", "es-ES", "fr-FR"]


class LocaleDefinition(ApiModel):
    code: LocaleCode
    language: str
    name: str
    native_name: str
    is_default: bool
    direction: Literal["ltr"] = "ltr"


class TranslationDictionary(ApiModel):
    dictionary_id: str
    locale: LocaleCode
    namespace: str = "common"
    entries: dict[str, str] = Field(default_factory=dict)
    fallback_locale: LocaleCode = "pt-BR"
    missing_keys: list[str] = Field(default_factory=list)


class LocalizationPreviewRequest(ApiModel):
    locale: LocaleCode
    key: str = Field(min_length=1)
    values: dict[str, str | int | float] = Field(default_factory=dict)
    fallback_locale: LocaleCode = "pt-BR"


class LocalizationPreviewResponse(ApiModel):
    requested_locale: LocaleCode
    resolved_locale: LocaleCode
    key: str
    text: str
    used_fallback: bool


class LocalizationValidateRequest(ApiModel):
    locale: LocaleCode
    required_keys: list[str] = Field(default_factory=list)
    fallback_locale: LocaleCode = "pt-BR"


class LocalizationValidationResponse(ApiModel):
    locale: LocaleCode
    valid: bool
    total_keys: int
    missing_keys: list[str] = Field(default_factory=list)
    fallback_keys: list[str] = Field(default_factory=list)


class GeneratedProjectLocaleProfile(ApiModel):
    selected_locale: LocaleCode = "pt-BR"
    fallback_locale: LocaleCode = "pt-BR"
    generated_docs_locale: LocaleCode = "pt-BR"
    generated_readme_locale: LocaleCode = "pt-BR"
    generated_comments_locale: LocaleCode = "pt-BR"
