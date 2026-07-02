from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser
from app.engines.prompt_master_engine import build_prompt_master_document
from app.repositories.project_repository import ProjectRepository
from app.schemas.prompt_master import PromptMasterDocument, PromptMasterPreviewRequest


router = APIRouter(tags=["prompt-master"])
project_repository = ProjectRepository()


@router.post("/prompt-master/preview", response_model=PromptMasterDocument)
def preview_prompt_master(payload: PromptMasterPreviewRequest, user: CurrentUser) -> PromptMasterDocument:
    if payload.blueprint is not None:
        blueprint = payload.blueprint.model_dump()
    else:
        project = project_repository.get_project_by_blueprint_id(payload.blueprint_id or "", user["user_id"])
        if project is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No blueprint with id '{payload.blueprint_id}' was found.",
            )
        blueprint = project["blueprint_snapshot"]

    return PromptMasterDocument.model_validate(build_prompt_master_document(blueprint))
