"""Analytics Center V1 endpoint.

`GET /api/analytics/overview` returns real operational intelligence scoped to the
authenticated user. All filters are accepted; unsupported ones are ignored
safely (documented in reports/analytics_missing_data_sources.md). The endpoint
never 500s because of a single failing collector.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser
from app.schemas.analytics import AnalyticsOverviewResponse
from app.services.analytics_service import AnalyticsFilters, analytics_service

router = APIRouter(tags=["analytics"])


@router.get("/analytics/overview", response_model=AnalyticsOverviewResponse)
def get_analytics_overview(
    user: CurrentUser,
    period: str | None = Query(default=None),
    workspace: str | None = Query(default=None),
    project_type: str | None = Query(default=None),
    provider: str | None = Query(default=None),
    stack: str | None = Query(default=None),
    status: str | None = Query(default=None),
    module: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    agent: str | None = Query(default=None),
    language: str | None = Query(default=None),
    framework: str | None = Query(default=None),
) -> AnalyticsOverviewResponse:
    filters = AnalyticsFilters(
        period=period,
        workspace=workspace,
        project_type=project_type,
        provider=provider,
        stack=stack,
        status=status,
        module=module,
        severity=severity,
        agent=agent,
        language=language,
        framework=framework,
    )
    return analytics_service.overview(user["user_id"], filters)
