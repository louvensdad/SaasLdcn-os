from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import Response

from app.core.config import get_settings
from app.core.database import connection
from app.core.metrics import render_latest
from app.schemas.health import HealthResponse


router = APIRouter(tags=["health"])
# Registered separately (and only outside production, see main.py) since a
# Prometheus scraper carries no bearer token -- this must stay unauthenticated
# but shouldn't be exposed on a production API by default.
metrics_router = APIRouter(tags=["health"])


@metrics_router.get("/metrics", include_in_schema=False)
def get_metrics() -> Response:
    body, content_type = render_latest()
    return Response(content=body, media_type=content_type)


@router.get("/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    settings = get_settings()
    try:
        with connection() as conn:
            conn.execute("SELECT 1")
        database_check = "ok"
    except Exception as exc:  # noqa: BLE001 -- health must never itself fail
        database_check = f"error: {type(exc).__name__}"
    overall = "ok" if database_check == "ok" else "degraded"
    return HealthResponse(
        status=overall,
        service=settings.app_name,
        version=settings.app_version,
        checks={"database": database_check},
    )
