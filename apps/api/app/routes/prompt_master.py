from __future__ import annotations

from fastapi import APIRouter

from app.engines.prompt_master_engine import build_prompt_master_document
from app.schemas.prompt_master import PromptMasterDocument, PromptMasterPreviewRequest


router = APIRouter(tags=["prompt-master"])


@router.post("/prompt-master/preview", response_model=PromptMasterDocument)
def preview_prompt_master(payload: PromptMasterPreviewRequest) -> PromptMasterDocument:
    blueprint = payload.blueprint.model_dump()
    return PromptMasterDocument.model_validate(build_prompt_master_document(blueprint))
