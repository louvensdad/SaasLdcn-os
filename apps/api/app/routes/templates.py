from __future__ import annotations

from fastapi import APIRouter, Query

from app.engines.template_metadata_engine import TemplateMetadataEngine
from app.engines.template_registry_engine import TemplateRegistryEngine
from app.schemas.template import (
    Template,
    TemplateCatalogResponse,
    TemplateCompatibilityResponse,
    TemplateMarketplaceItem,
    TemplateRecommendationResponse,
)
from app.services.catalog_service import CatalogService


router = APIRouter(tags=["templates"])
service = CatalogService()
registry_engine = TemplateRegistryEngine()
metadata_engine = TemplateMetadataEngine(registry_engine)


@router.get("/templates", response_model=list[Template])
def list_templates() -> list[Template]:
    return [Template.model_validate(item) for item in service.list_templates()]


@router.get("/templates/catalog", response_model=TemplateCatalogResponse)
def template_catalog() -> TemplateCatalogResponse:
    templates = registry_engine.list_templates()
    return TemplateCatalogResponse.model_validate(
        {
            "contractVersion": templates[0]["contractVersion"],
            "templates": templates,
            "categories": registry_engine.categories(),
        }
    )


@router.get("/templates/categories", response_model=list[str])
def template_categories() -> list[str]:
    return registry_engine.categories()


@router.get("/templates/recommended", response_model=TemplateRecommendationResponse)
def recommended_templates(
    language_id: str | None = None,
    framework_id: str | None = None,
    architecture_id: str | None = None,
    archetype_id: str | None = None,
    capability_ids: list[str] = Query(default_factory=list),
) -> TemplateRecommendationResponse:
    return TemplateRecommendationResponse.model_validate(
        metadata_engine.recommendations(
            {
                "language_id": language_id,
                "framework_id": framework_id,
                "architecture_id": architecture_id,
                "archetype_id": archetype_id,
                "capability_ids": capability_ids,
            }
        )
    )


@router.get("/templates/{template_id}", response_model=TemplateMarketplaceItem)
def template_detail(template_id: str) -> TemplateMarketplaceItem:
    return TemplateMarketplaceItem.model_validate(registry_engine.get_template(template_id))


@router.get("/templates/{template_id}/compatibility", response_model=TemplateCompatibilityResponse)
def template_compatibility(
    template_id: str,
    language_id: str | None = None,
    framework_id: str | None = None,
    architecture_id: str | None = None,
    archetype_id: str | None = None,
    capability_ids: list[str] = Query(default_factory=list),
) -> TemplateCompatibilityResponse:
    return TemplateCompatibilityResponse.model_validate(
        metadata_engine.compatibility(
            template_id,
            {
                "language_id": language_id,
                "framework_id": framework_id,
                "architecture_id": architecture_id,
                "archetype_id": archetype_id,
                "capability_ids": capability_ids,
            },
        )
    )
