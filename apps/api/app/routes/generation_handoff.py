from __future__ import annotations

from fastapi import APIRouter

from app.engines.generation_handoff_engine import build_generation_handoff_package
from app.routes.projects import service as project_service
from app.schemas.generation_handoff import GenerationHandoffPackage, GenerationHandoffPreviewRequest

router = APIRouter(tags=["generation-handoff"])


@router.post("/generation/handoff-preview", response_model=GenerationHandoffPackage)
def preview_generation_handoff(payload: GenerationHandoffPreviewRequest) -> GenerationHandoffPackage:
    project = project_service.get_project(payload.project_id)
    return GenerationHandoffPackage.model_validate(build_generation_handoff_package(project))
