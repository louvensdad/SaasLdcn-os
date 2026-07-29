from __future__ import annotations
from datetime import datetime
from typing import Any
from pydantic import Field
from app.schemas.common import ApiModel

class ActivityEventResponse(ApiModel):
    id: str
    user_id: str
    workspace_id: str | None = None
    project_id: str | None = None
    category: str
    action: str
    status: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime
    source: str
    correlation_id: str
    severity: str = "INFO"
    importance: str = "NORMAL"
    evidence_ref: str | None = None
    resolved_at: datetime | None = None

class ActivityFeedResponse(ApiModel):
    items: list[ActivityEventResponse]
    next_cursor: str | None = None
    has_more: bool = False
