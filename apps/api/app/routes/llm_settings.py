from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser
from app.schemas.llm_settings import ActiveLlmSettings, ConfirmLlmUseRequest, LlmResolution, SelectLlmProviderRequest
from app.services.llm_settings_service import llm_provider_resolver, llm_settings_service

router = APIRouter(tags=["llm-settings"])


@router.get("/llm/settings/active", response_model=ActiveLlmSettings)
def get_active_llm_settings(user: CurrentUser) -> ActiveLlmSettings:
    return llm_settings_service.active(user["user_id"])


@router.put("/llm/settings/active", response_model=ActiveLlmSettings)
def select_active_llm_provider(payload: SelectLlmProviderRequest, user: CurrentUser) -> ActiveLlmSettings:
    try:
        return llm_settings_service.select(user["user_id"], payload.provider, model=payload.model)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


@router.post("/llm/settings/confirm", response_model=LlmResolution)
def confirm_active_llm_use(payload: ConfirmLlmUseRequest, user: CurrentUser) -> LlmResolution:
    return llm_provider_resolver.resolve(
        workspace_id=payload.workspaceId, user_id=user["user_id"],
        requested_capability=payload.requestedCapability,
        optional_override_provider=payload.optionalOverrideProvider,
        deterministic=payload.mode == "deterministic",
    ).resolution
