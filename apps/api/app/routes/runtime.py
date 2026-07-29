from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.core.deps import CurrentUser, RequireAdmin
from app.engines.runtime_metrics_engine import runtime_metrics_engine
from app.schemas.runtime import PlatformRuntimeConfig, RuntimeMetrics, RuntimeTelemetry, UpdatePlatformRuntimeConfigRequest
from app.services.platform_runtime_config_service import platform_runtime_config_service
from app.services.activity_feed_service import activity_feed_service

router = APIRouter(tags=["runtime"])


@router.get("/runtime/metrics", response_model=RuntimeMetrics)
def get_runtime_metrics(user: CurrentUser) -> RuntimeMetrics:
    del user  # host/platform-global metrics; auth only gates visibility
    return RuntimeMetrics.model_validate(runtime_metrics_engine.collect())


@router.get("/runtime/telemetry", response_model=RuntimeTelemetry)

def get_runtime_telemetry(user: CurrentUser) -> RuntimeTelemetry:
    del user
    return RuntimeTelemetry.model_validate(runtime_metrics_engine.collect_telemetry())



@router.get("/runtime/telemetry/stream")
async def stream_runtime_telemetry(request: Request, user: CurrentUser) -> StreamingResponse:
    del user
    async def events():
        while not await request.is_disconnected():
            payload = runtime_metrics_engine.collect_telemetry()
            yield f"event: telemetry\ndata: {json.dumps(payload, separators=(',', ':'))}\n\n"
            yield ": heartbeat\n\n"
            await asyncio.sleep(5)
    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
@router.get("/runtime/config", response_model=PlatformRuntimeConfig)
def get_runtime_config(user: CurrentUser) -> PlatformRuntimeConfig:
    del user  # platform-global, read-only for any authenticated user
    return PlatformRuntimeConfig.model_validate(platform_runtime_config_service.get_effective())


@router.put("/runtime/config", response_model=PlatformRuntimeConfig)
def update_runtime_config(payload: UpdatePlatformRuntimeConfigRequest, user: RequireAdmin) -> PlatformRuntimeConfig:
    # RequireAdmin already enforced the role check
    effective = platform_runtime_config_service.get_effective()
    if payload.workerLimit is not None:
        effective = platform_runtime_config_service.update_worker_limit(payload.workerLimit)
    if payload.executionTimeoutMinutes is not None:
        effective = platform_runtime_config_service.update_execution_timeout_minutes(payload.executionTimeoutMinutes)
    if payload.logRetentionDays is not None:
        effective = platform_runtime_config_service.update_log_retention_days(payload.logRetentionDays)
    result = PlatformRuntimeConfig.model_validate(effective)
    activity_feed_service.record(user_id=user["user_id"], category="runtime", action="runtime_config_updated", status="success", severity="SUCCESS", importance="NORMAL", metadata={"fields": [key for key, value in payload.model_dump().items() if value is not None]})
    return result
