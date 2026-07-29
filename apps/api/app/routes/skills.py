from __future__ import annotations

from fastapi import APIRouter

from app.core.deps import CurrentUser
from app.engines.skill_execution_engine import SkillExecutionEngine
from app.engines.skill_registry_engine import SkillRegistryEngine
from app.routes.projects import service as project_service
from app.schemas.skill import (
    SkillCatalogResponse,
    SkillDefinition,
    SkillExecutionRequest,
    SkillExecutionResult,
    SkillPreview,
    SkillPreviewRequest,
    SkillRecommendation,
)

router = APIRouter(tags=["skills"])
engine = SkillRegistryEngine()
execution_engine = SkillExecutionEngine(project_service=project_service)


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


@router.post("/skills/execute", response_model=SkillExecutionResult)
def execute_skill(payload: SkillExecutionRequest, user: CurrentUser) -> SkillExecutionResult:
    return SkillExecutionResult.model_validate(
        execution_engine.execute(payload.skill_id, payload.project_id, payload.context, user["user_id"])
    )


@router.get("/skills/{skill_id}", response_model=SkillDefinition)
def skill_detail(skill_id: str) -> SkillDefinition:
    return SkillDefinition.model_validate(engine.get_skill(skill_id))
