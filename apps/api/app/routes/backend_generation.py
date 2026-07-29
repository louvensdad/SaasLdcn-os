from __future__ import annotations

from fastapi import APIRouter

from app.core.deps import CurrentUser
from app.engines.backend_generation_engine import BackendGenerationEngine
from app.routes.projects import service as project_service
from app.schemas.backend_generation import (
    BackendGenerationRequest,
    BackendGenerationTemplateCatalog,
    GenerationManifest,
)

router = APIRouter(tags=["backend-generation"])
engine = BackendGenerationEngine()


@router.post("/backend-generation/preview", response_model=GenerationManifest)
def preview_backend_generation(payload: BackendGenerationRequest, user: CurrentUser) -> GenerationManifest:
    project = project_service.get_project(payload.project_id, user["user_id"])
    manifest = engine.preview(project, payload.model_dump())
    return GenerationManifest.model_validate(manifest)


@router.post("/backend-generation/run", response_model=GenerationManifest)
def run_backend_generation(payload: BackendGenerationRequest, user: CurrentUser) -> GenerationManifest:
    project = project_service.get_project(payload.project_id, user["user_id"])
    manifest = engine.run(project, payload.model_dump())
    if manifest["status"] == "generated":
        project_service.update_project(
            payload.project_id,
            {
                "status": "generated",
                "readiness_status": "generated",
                "generated_project_path": manifest["output_path"],
            },
            user["user_id"],
        )
    return GenerationManifest.model_validate(manifest)


@router.get("/backend-generation/templates", response_model=BackendGenerationTemplateCatalog)
def list_backend_generation_templates() -> BackendGenerationTemplateCatalog:
    return BackendGenerationTemplateCatalog.model_validate(engine.templates())


@router.get("/backend-generation/status/{generation_id}", response_model=GenerationManifest)
def backend_generation_status(generation_id: str) -> GenerationManifest:
    return GenerationManifest.model_validate(engine.status(generation_id))
