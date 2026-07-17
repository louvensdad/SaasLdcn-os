from __future__ import annotations

import base64
import json
import logging
from typing import Any
from uuid import uuid4

from app.repositories.activity_event_repository import activity_event_repository

logger = logging.getLogger("ldcn.api.activity")
_SECRET_WORDS = ("token", "secret", "password", "credential", "api_key", "apikey", "authorization", "prompt", "private_key")


def sanitize_metadata(value: Any, *, key: str = "") -> Any:
    if any(word in key.lower() for word in _SECRET_WORDS): return "[REDACTED]"
    if isinstance(value, dict): return {str(k): sanitize_metadata(v, key=str(k)) for k, v in value.items()}
    if isinstance(value, list): return [sanitize_metadata(item, key=key) for item in value[:50]]
    if isinstance(value, (str, int, float, bool)) or value is None: return value if not (isinstance(value, str) and len(value) > 2000) else value[:2000] + "…"
    return str(value)[:500]


class ActivityFeedService:
    def record(self, *, user_id: str, category: str, action: str, status: str, metadata: dict[str, Any] | None = None, workspace_id: str | None = None, project_id: str | None = None, source: str = "api", correlation_id: str | None = None, severity: str = "INFO", importance: str = "NORMAL", evidence_ref: str | None = None, resolved_at: str | None = None) -> None:
        try:
            activity_event_repository.create(user_id=user_id, workspace_id=workspace_id, project_id=project_id, category=category, action=action, status=status, metadata=sanitize_metadata(metadata or {}), source=source, correlation_id=correlation_id or uuid4().hex, severity=severity, importance=importance, evidence_ref=evidence_ref, resolved_at=resolved_at)
        except Exception: logger.exception("activity event persistence failed")

    def list(self, user_id: str, **filters: Any) -> dict[str, Any]:
        limit = max(1, min(int(filters.pop("limit", 25)), 100))
        encoded_cursor = filters.pop("cursor", None)
        cursor = None
        if encoded_cursor:
            try:
                raw = base64.urlsafe_b64decode(encoded_cursor.encode()).decode().split("\x00", 1)
                cursor = (raw[0], raw[1])
            except (ValueError, UnicodeDecodeError, base64.binascii.Error):
                cursor = None
        sort = filters.pop("sort", "desc")
        workspace_id = filters.pop("workspace_id", None)
        rows = activity_event_repository.list_for_user(user_id, workspace_id=workspace_id, limit=limit, cursor=cursor, sort=sort, **filters)
        has_more = len(rows) > limit
        rows = rows[:limit]
        items = []
        for row in rows:
            row["metadata"] = json.loads(row.pop("metadata_json") or "{}")
            items.append(row)
        next_cursor = None
        if has_more and items:
            tail = items[-1]
            next_cursor = base64.urlsafe_b64encode(f"{tail['occurred_at']}\x00{tail['id']}".encode()).decode()
        return {"items": items, "has_more": has_more, "next_cursor": next_cursor}

    def get(self, user_id: str, event_id: str, workspace_id: str | None = None) -> dict[str, Any] | None:
        row = activity_event_repository.get_for_user(user_id, event_id, workspace_id)
        if not row: return None
        row["metadata"] = json.loads(row.pop("metadata_json") or "{}")
        return row


activity_feed_service = ActivityFeedService()