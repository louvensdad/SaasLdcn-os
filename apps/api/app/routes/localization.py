from __future__ import annotations

from fastapi import APIRouter

from app.schemas.localization import (
    LocaleDefinition,
    LocalizationPreviewRequest,
    LocalizationPreviewResponse,
    LocalizationValidateRequest,
    LocalizationValidationResponse,
    TranslationDictionary,
)
from app.services.localization_service import LocalizationService

router = APIRouter(tags=["localization"])
service = LocalizationService()


@router.get("/localization/locales", response_model=list[LocaleDefinition])
def list_locales() -> list[LocaleDefinition]:
    return [LocaleDefinition.model_validate(item) for item in service.locales()]


@router.get("/localization/dictionary/{locale}", response_model=TranslationDictionary)
def get_dictionary(locale: str) -> TranslationDictionary:
    return TranslationDictionary.model_validate(service.dictionary(locale))


@router.post("/localization/preview", response_model=LocalizationPreviewResponse)
def preview_translation(payload: LocalizationPreviewRequest) -> LocalizationPreviewResponse:
    return LocalizationPreviewResponse.model_validate(service.preview(payload.locale, payload.key, payload.values, payload.fallback_locale))


@router.post("/localization/validate", response_model=LocalizationValidationResponse)
def validate_dictionary(payload: LocalizationValidateRequest) -> LocalizationValidationResponse:
    return LocalizationValidationResponse.model_validate(service.validate(payload.locale, payload.required_keys, payload.fallback_locale))
