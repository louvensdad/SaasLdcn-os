from __future__ import annotations

from fastapi import APIRouter, Query

from app.schemas.infrastructure import (
    InfrastructureComponent,
    InfrastructureRecommendation,
    InfrastructureRecommendationSelection,
)
from app.services.infrastructure_registry_service import InfrastructureRegistryService


router = APIRouter(tags=["infrastructure"])
service = InfrastructureRegistryService()


@router.get("/infrastructure/components", response_model=list[InfrastructureComponent])
def list_components() -> list[InfrastructureComponent]:
    return [InfrastructureComponent.model_validate(item) for item in service.list_components()]


@router.get("/infrastructure/categories", response_model=list[str])
def list_categories() -> list[str]:
    return service.list_categories()


@router.get("/infrastructure/components/{component_id}", response_model=InfrastructureComponent)
def get_component(component_id: str) -> InfrastructureComponent:
    return InfrastructureComponent.model_validate(service.get_component(component_id))


@router.get("/infrastructure/recommendations", response_model=InfrastructureRecommendation)
def get_recommendations(
    language_id: str = "",
    framework_id: str = "",
    architecture_id: str = "",
    archetype_id: str = "",
    capability_ids: list[str] = Query(default_factory=list),
    architecture_level: str = "",
) -> InfrastructureRecommendation:
    payload = InfrastructureRecommendationSelection(
        language_id=language_id or "unknown",
        framework_id=framework_id or "unknown",
        architecture_id=architecture_id or "unknown",
        archetype_id=archetype_id or "unknown",
        capability_ids=capability_ids,
        architecture_level=architecture_level or "unknown",
    )
    return InfrastructureRecommendation.model_validate(service.get_recommendations(payload.model_dump()))


@router.post("/infrastructure/recommendations", response_model=InfrastructureRecommendation)
def post_recommendations(payload: InfrastructureRecommendationSelection) -> InfrastructureRecommendation:
    return InfrastructureRecommendation.model_validate(service.get_recommendations(payload.model_dump()))
