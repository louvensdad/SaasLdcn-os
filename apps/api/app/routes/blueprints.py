from __future__ import annotations

from fastapi import APIRouter

from app.engines.blueprint_engine import build_blueprint
from app.schemas.blueprint import BlueprintPreviewRequest, ProjectBlueprint


router = APIRouter(tags=["blueprints"])


@router.post("/blueprints/preview", response_model=ProjectBlueprint)
def preview_blueprint(payload: BlueprintPreviewRequest) -> ProjectBlueprint:
    return ProjectBlueprint.model_validate(build_blueprint(payload.model_dump()))
