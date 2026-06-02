from __future__ import annotations

from fastapi import APIRouter

from app.engines.skill_registry_engine import SkillRegistryEngine
from app.schemas.skill import (
    SkillCatalogResponse,
    SkillDefinition,
    SkillPreview,
    SkillPreviewRequest,
    SkillRecommendation,
)

router = APIRouter(tags=["skills"])
engine = SkillRegistryEngine()


@router.get("/skills", response_model=SkillCatalogResponse)
def skill_catalog() -> SkillCatalogResponse:
    skills = engine.list_skills()
    return SkillCatalogResponse.model_validate(
        {
            "contractVersion": skills[0]["contractVersion"],
            "skills": skills,
            "categories": engine.categories(),
        }
    )


@router.get("/skills/categories", response_model=list[str])
def skill_categories() -> list[str]:
    return engine.categories()


@router.get("/skills/recommended", response_model=list[SkillRecommendation])
def recommended_skills(
    project_id: str | None = None,
    language_id: str | None = None,
    framework_id: str | None = None,
    architecture_id: str | None = None,
    archetype_id: str | None = None,
    has_generated_project: bool = False,
) -> list[SkillRecommendation]:
    return [
        SkillRecommendation.model_validate(item)
        for item in engine.recommendations(
            {
                "project_id": project_id,
                "language_id": language_id,
                "framework_id": framework_id,
                "architecture_id": architecture_id,
                "archetype_id": archetype_id,
                "has_generated_project": has_generated_project,
            }
        )
    ]


@router.post("/skills/preview", response_model=SkillPreview)
def preview_skill(payload: SkillPreviewRequest) -> SkillPreview:
    return SkillPreview.model_validate(engine.preview(payload.skill_id, payload.context))


@router.get("/skills/{skill_id}", response_model=SkillDefinition)
def skill_detail(skill_id: str) -> SkillDefinition:
    return SkillDefinition.model_validate(engine.get_skill(skill_id))
