from __future__ import annotations

from datetime import datetime
from typing import Literal
from pydantic import Field
from app.schemas.common import ApiModel

PresenceStatus = Literal["HEALTHY", "PROCESSING", "WARNING", "BLOCKED", "FAILED", "DEGRADED", "UNKNOWN"]
Severity = Literal["INFO", "SUCCESS", "WARNING", "ERROR", "CRITICAL"]
Importance = Literal["LOW", "NORMAL", "HIGH", "BLOCKING"]

class SystemPresence(ApiModel):
    status: PresenceStatus
    activity: str
    updated: datetime

class PresenceDecision(ApiModel):
    id: str
    title: str
    category: str
    status: str
    severity: Severity
    importance: Importance
    source: str
    correlation_id: str = Field(alias="correlationId")
    project_id: str | None = Field(default=None, alias="projectId")
    workspace_id: str | None = Field(default=None, alias="workspaceId")
    evidence_ref: str | None = Field(default=None, alias="evidenceRef")
    occurred_at: datetime = Field(alias="occurredAt")
    summary: str | None = None

class PresenceDecisionResponse(ApiModel):
    items: list[PresenceDecision]
    next_cursor: str | None = Field(default=None, alias="nextCursor")