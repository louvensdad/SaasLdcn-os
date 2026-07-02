from __future__ import annotations

from fastapi import APIRouter

from app.core.deps import CurrentUser
from app.engines.generated_project_quality_engine import GeneratedProjectQualityEngine
from app.routes.projects import service as project_service
from app.schemas.generated_project_quality import GeneratedProjectQualityResponse

router = APIRouter(tags=["generated-project-quality"])
engine = GeneratedProjectQualityEngine()


@router.post("/generated-projects/{project_id}/quality-check", response_model=GeneratedProjectQualityResponse)
def run_generated_project_quality_check(project_id: str, user: CurrentUser) -> GeneratedProjectQualityResponse:
    project = project_service.get_project(project_id, user["user_id"])
    return GeneratedProjectQualityResponse.model_validate(engine.quality_check(project))
