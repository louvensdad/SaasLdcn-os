from __future__ import annotations

import logging
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser
from app.data.model_registry import MODEL_REGISTRY
from app.engines.documentation_ai_writer import DocumentationAiWriter
from app.engines.documentation_engine import DocumentationEngine
from app.engines.llm.base import LLMError
from app.routes.projects import service as project_service
from app.schemas.documentation import (
    DocumentationExportRequest,
    DocumentationExportResponse,
    DocumentationGenerateRequest,
    DocumentationGenerateResponse,
    DocumentationLibraryResponse,
    DocumentationSaveRequest,
    DocumentationSaveResponse,
)
from app.services.llm_settings_service import llm_provider_resolver

router = APIRouter(tags=["documentation"])
engine = DocumentationEngine()
writer = DocumentationAiWriter()
logger = logging.getLogger("ldcn.api.documentation")

_GENERIC_LLM_MESSAGE = "O provedor de IA estÃƒÂ¡ temporariamente indisponÃƒÂ­vel. Tente novamente em instantes."


def _resolve_api_key(user: dict, *, use_user_key: bool, user_model_choice: str | None) -> str | None:
    context = llm_provider_resolver.resolve(
        workspace_id=None,
        user_id=user["user_id"],
        requested_capability="documentation_ai_writer",
        requested_model=user_model_choice,
    )
    if context.resolution.mode == "llm":
        return context.api_key
    if use_user_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{context.resolution.reason} API key não disponível.",
        )
    return None

@router.get("/projects/{project_id}/documentation", response_model=DocumentationLibraryResponse)
def get_project_documentation(project_id: str, user: CurrentUser) -> DocumentationLibraryResponse:
    project = project_service.get_project(project_id, user["user_id"])
    return DocumentationLibraryResponse.model_validate(engine.analyze(project))


@router.post("/projects/{project_id}/documentation/export", response_model=DocumentationExportResponse)
def export_project_documentation(
    project_id: str,
    user: CurrentUser,
    payload: DocumentationExportRequest | None = None,
) -> DocumentationExportResponse:
    project = project_service.get_project(project_id, user["user_id"])
    organize = bool(payload.organize) if payload else False
    return DocumentationExportResponse.model_validate(engine.export(project, organize=organize))


@router.post("/projects/{project_id}/documentation/generate", response_model=DocumentationGenerateResponse)
def generate_project_documentation(
    project_id: str,
    payload: DocumentationGenerateRequest,
    user: CurrentUser,
) -> DocumentationGenerateResponse:
    project = project_service.get_project(project_id, user["user_id"])
    api_key = _resolve_api_key(user, use_user_key=payload.use_user_key, user_model_choice=payload.user_model_choice)
    try:
        result = writer.generate(
            project,
            doc_ids=payload.doc_ids,
            user_model_choice=payload.user_model_choice,
            api_key=api_key,
        )
    except LLMError as exc:
        correlation_id = uuid4().hex
        logger.warning("Documentation LLM failure [%s]: %s", correlation_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"{_GENERIC_LLM_MESSAGE} (ref: {correlation_id})",
        ) from exc
    return DocumentationGenerateResponse.model_validate(result)


@router.post("/projects/{project_id}/documentation/save", response_model=DocumentationSaveResponse)
def save_project_documentation(
    project_id: str,
    payload: DocumentationSaveRequest,
    user: CurrentUser,
) -> DocumentationSaveResponse:
    project = project_service.get_project(project_id, user["user_id"])
    items = [{"id": item.id, "content": item.content} for item in payload.docs]
    return DocumentationSaveResponse.model_validate(
        writer.save(project, items, overwrite=payload.overwrite)
    )
