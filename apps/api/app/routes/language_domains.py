from __future__ import annotations

from fastapi import APIRouter

from app.schemas.language_domain import LanguageDomainProfile, LanguageDomainRecommendation
from app.schemas.registry import Architecture, Archetype, Capability, Framework
from app.services.language_domain_service import LanguageDomainService


router = APIRouter(tags=["language-domains"])
service = LanguageDomainService()


@router.get("/languages/{language_id}/profile", response_model=LanguageDomainProfile)
def get_language_profile(language_id: str) -> LanguageDomainProfile:
    return LanguageDomainProfile.model_validate(service.get_language_profile(language_id))


@router.get("/languages/{language_id}/frameworks", response_model=list[Framework])
def get_language_frameworks(language_id: str) -> list[Framework]:
    return [Framework.model_validate(item) for item in service.get_language_frameworks(language_id)]


@router.get("/languages/{language_id}/architectures", response_model=list[Architecture])
def get_language_architectures(language_id: str) -> list[Architecture]:
    return [Architecture.model_validate(item) for item in service.get_language_architectures(language_id)]


@router.get("/languages/{language_id}/archetypes", response_model=list[Archetype])
def get_language_archetypes(language_id: str) -> list[Archetype]:
    return [Archetype.model_validate(item) for item in service.get_language_archetypes(language_id)]


@router.get("/languages/{language_id}/capabilities", response_model=list[Capability])
def get_language_capabilities(language_id: str) -> list[Capability]:
    return [Capability.model_validate(item) for item in service.get_language_capabilities(language_id)]


@router.get("/languages/{language_id}/recommendations", response_model=list[LanguageDomainRecommendation])
def get_language_recommendations(language_id: str) -> list[LanguageDomainRecommendation]:
    return [LanguageDomainRecommendation.model_validate(item) for item in service.get_language_recommendations(language_id)]
