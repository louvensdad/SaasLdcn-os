from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser
from app.core.metrics import LLM_CACHE_BYTES, LLM_CACHE_ENTRIES, LLM_CACHE_EVENTS
from app.repositories.llm_usage_repository import LlmUsageRepository
from app.schemas.llm_settings import (
    ActiveLlmSettings,
    ConfirmLlmUseRequest,
    LlmCacheStats,
    LlmModelUsage,
    LlmResolution,
    LlmUsageStats,
    SelectLlmProviderRequest,
)
from app.services.llm_settings_service import llm_provider_resolver, llm_settings_service

router = APIRouter(tags=["llm-settings"])


def _counter(outcome: str) -> int:
    return int(LLM_CACHE_EVENTS.labels(outcome=outcome)._value.get())  # noqa: SLF001 -- prometheus_client has no public single-sample getter


@router.get("/llm/cache-stats", response_model=LlmCacheStats)
def get_llm_cache_stats(user: CurrentUser) -> LlmCacheStats:
    del user  # process-global cache, not user-scoped -- auth only gates visibility
    return LlmCacheStats(
        hits=_counter("hit"),
        misses=_counter("miss"),
        stored=_counter("stored"),
        evicted=_counter("evicted"),
        expired=_counter("expired"),
        oversized=_counter("oversized"),
        entries=int(LLM_CACHE_ENTRIES._value.get()),  # noqa: SLF001
        bytes=int(LLM_CACHE_BYTES._value.get()),  # noqa: SLF001
    )


@router.get("/llm/usage/stats", response_model=LlmUsageStats)
def get_llm_usage_stats(user: CurrentUser) -> LlmUsageStats:
    del user  # process-global telemetry, not user-scoped -- auth only gates visibility
    return LlmUsageStats.model_validate(LlmUsageRepository().stats(window_hours=24))


@router.get("/llm/usage/by-model", response_model=list[LlmModelUsage])
def get_llm_usage_by_model(user: CurrentUser) -> list[LlmModelUsage]:
    del user  # process-global telemetry, not user-scoped -- auth only gates visibility
    return [LlmModelUsage.model_validate(row) for row in LlmUsageRepository().stats_by_model(window_hours=24)]


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
