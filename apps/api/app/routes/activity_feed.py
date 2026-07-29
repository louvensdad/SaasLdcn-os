from __future__ import annotations

import csv
import io
import json
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse, PlainTextResponse

from app.core.deps import CurrentUser
from app.repositories.tenant_repository import TenantAccessError, TenantRepository
from app.schemas.activity_feed import ActivityEventResponse, ActivityFeedResponse
from app.services.activity_feed_service import activity_feed_service

router = APIRouter(tags=["activity-feed"])


def _workspace(user: dict, requested: str | None) -> str:
    repository = TenantRepository()
    try:
        if requested:
            return repository.require_workspace(requested, user["user_id"])["workspace_id"]
        current = repository.personal_workspace(user["user_id"])
        if current is None:
            current = repository.ensure_personal_workspace(user["user_id"], user["full_name"])
        return current["workspace_id"]
    except TenantAccessError as exc:
        raise HTTPException(status_code=404, detail="Workspace not found or inaccessible.") from exc


@router.get("/activity-feed", response_model=ActivityFeedResponse)
def get_activity_feed(
    user: CurrentUser,
    workspace_id: str | None = Query(default=None),
    cursor: str | None = None,
    category: str | None = Query(default=None, max_length=40),
    status: str | None = Query(default=None, max_length=20),
    from_date: str | None = Query(default=None, alias="from", max_length=40),
    to_date: str | None = Query(default=None, alias="to", max_length=40),
    search: str | None = Query(default=None, max_length=100),
    sort: Literal["asc", "desc"] = "desc",
    limit: int = Query(default=25, ge=1, le=100),
) -> ActivityFeedResponse:
    workspace = _workspace(user, workspace_id)
    return ActivityFeedResponse.model_validate(activity_feed_service.list(user["user_id"], workspace_id=workspace, limit=limit, cursor=cursor, category=category, status=status, from_date=from_date, to_date=to_date, search=search, sort=sort))


@router.get("/activity-feed/export", response_model=None)
def export_activity_feed(user: CurrentUser, workspace_id: str | None = Query(default=None), format: Literal["json", "csv"] = "json", category: str | None = None, status: str | None = None, search: str | None = None) -> JSONResponse | PlainTextResponse:
    workspace = _workspace(user, workspace_id)
    payload = activity_feed_service.list(user["user_id"], workspace_id=workspace, limit=100, category=category, status=status, search=search, sort="desc")
    if format == "json":
        return JSONResponse({"items": payload["items"], "exported": True})
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["id", "category", "action", "status", "occurred_at", "source", "correlation_id", "metadata"])
    writer.writeheader()
    for item in payload["items"]:
        writer.writerow({**item, "metadata": json.dumps(item["metadata"], ensure_ascii=False, separators=(",", ":"))})
    return PlainTextResponse(output.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=ldcn-activity.csv"})


@router.get("/activity-feed/{event_id}", response_model=ActivityEventResponse)
def get_activity_event(event_id: str, user: CurrentUser, workspace_id: str | None = Query(default=None)) -> ActivityEventResponse:
    workspace = _workspace(user, workspace_id)
    event = activity_feed_service.get(user["user_id"], event_id, workspace)
    if not event:
        raise HTTPException(status_code=404, detail="Activity event not found.")
    return ActivityEventResponse.model_validate(event)