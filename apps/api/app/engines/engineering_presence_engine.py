from __future__ import annotations

import base64
import json
from datetime import datetime, timedelta, timezone
from typing import Any
from sqlalchemy import select
from app.core.database import database_url_for, session_factory
from app.models.activity_event import ActivityEvent
from app.models.persistence import GenerationJob

_RUNNING_MARKERS = ("RUNNING", "GENERATING", "PREPARING", "VALIDATING", "PLANNING")
_BLOCKED_STATUSES = frozenset({"BLOCKED", "NEEDS_USER_ACTION", "STALLED", "PAUSED"})
_RECENT_ACTIVITY_WINDOW = timedelta(minutes=30)
_PRIORITY = {"CRITICAL": 500, "BLOCKING": 500, "ERROR": 400, "WARNING": 300, "HIGH": 300, "PROCESSING": 250, "SUCCESS": 200, "INFO": 100, "NORMAL": 100, "LOW": 50}


def _parse_iso(value: str | None) -> datetime | None:
    if not value: return None
    try: return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError: return None


def _resolved(event: ActivityEvent) -> bool:
    if event.resolved_at: return True
    try: return bool(json.loads(event.metadata_json or "{}").get("resolved"))
    except (TypeError, ValueError): return False


def _event_priority(event: ActivityEvent) -> int:
    if _resolved(event): return 0
    return max(_PRIORITY.get((event.severity or "INFO").upper(), 100), _PRIORITY.get((event.importance or "NORMAL").upper(), 100))


class EngineeringPresenceEngine:
    def __init__(self, database: str | None = None) -> None:
        self._sessions = session_factory(database_url_for(database))

    def _latest_job(self, user_id: str, workspace_id: str | None) -> GenerationJob | None:
        with self._sessions() as session:
            statement = select(GenerationJob).where(GenerationJob.owner_user_id == user_id, GenerationJob.archived.is_(False))
            if workspace_id: statement = statement.where(GenerationJob.workspace_id == workspace_id)
            return session.scalar(statement.order_by(GenerationJob.updated_at.desc()).limit(1))

    def _events(self, user_id: str, workspace_id: str | None, limit: int = 100) -> list[ActivityEvent]:
        with self._sessions() as session:
            statement = select(ActivityEvent).where(ActivityEvent.user_id == user_id)
            if workspace_id: statement = statement.where(ActivityEvent.workspace_id == workspace_id)
            return list(session.scalars(statement.order_by(ActivityEvent.occurred_at.desc()).limit(limit)))

    def collect(self, user_id: str, workspace_id: str | None = None) -> dict[str, Any]:
        job = self._latest_job(user_id, workspace_id)
        events = self._events(user_id, workspace_id)
        now = datetime.now(timezone.utc)
        active = [event for event in events if not _resolved(event) and (_parse_iso(event.occurred_at) is None or now - _parse_iso(event.occurred_at) <= _RECENT_ACTIVITY_WINDOW or (event.severity or "").upper() in {"ERROR", "CRITICAL"} or (event.importance or "").upper() == "BLOCKING")]
        if any((event.severity or "").upper() == "CRITICAL" and (event.importance or "").upper() in {"HIGH", "BLOCKING"} for event in active):
            event = max((event for event in active if (event.severity or "").upper() == "CRITICAL"), key=_event_priority)
            return {"status": "BLOCKED", "activity": f"{event.category}: {event.action}", "updated": event.occurred_at}
        if job is not None:
            status_upper = (job.status or "").upper()
            if status_upper == "FAILED": return {"status": "FAILED", "activity": f"Falha na geração: {job.project_id}", "updated": job.updated_at}
            if status_upper in _BLOCKED_STATUSES: return {"status": "BLOCKED", "activity": f"Aguardando ação: {job.project_id}", "updated": job.updated_at}
            if any(marker in status_upper for marker in _RUNNING_MARKERS):
                return {"status": "PROCESSING", "activity": f"{(job.stage or job.status or '').replace('_', ' ').title()} — {job.project_id}", "updated": job.updated_at}
        if active:
            event = max(active, key=_event_priority)
            if (event.severity or "").upper() in {"ERROR", "CRITICAL"} or (event.status or "").lower() == "failed":
                return {"status": "FAILED", "activity": f"{event.category}: {event.action}", "updated": event.occurred_at}
            if (event.severity or "").upper() == "WARNING" or (event.status or "").lower() == "warning":
                return {"status": "WARNING", "activity": f"{event.category}: {event.action}", "updated": event.occurred_at}
        latest = events[0] if events else None
        if latest and _parse_iso(latest.occurred_at) and datetime.now(timezone.utc) - _parse_iso(latest.occurred_at) <= _RECENT_ACTIVITY_WINDOW:
            return {"status": "HEALTHY", "activity": "Sistema operacional", "updated": latest.occurred_at}
        return {"status": "HEALTHY", "activity": "Sistema operacional", "updated": latest.occurred_at if latest else datetime.now(timezone.utc).isoformat()}

    def decisions(self, user_id: str, workspace_id: str | None = None, *, project_id: str | None = None, category: str | None = None, severity: str | None = None, limit: int = 25, cursor: str | None = None) -> dict[str, Any]:
        events = self._events(user_id, workspace_id, 500)
        if project_id: events = [event for event in events if event.project_id == project_id]
        if category: events = [event for event in events if event.category.lower() == category.lower()]
        if severity: events = [event for event in events if event.severity.upper() == severity.upper()]
        events.sort(key=lambda event: (_event_priority(event), event.occurred_at, event.id), reverse=True)
        if cursor:
            try:
                raw = base64.urlsafe_b64decode(cursor.encode()).decode().split("\0", 1)
                events = [event for event in events if (event.occurred_at, event.id) < (raw[0], raw[1])]
            except (ValueError, UnicodeDecodeError, base64.binascii.Error): pass
        selected = events[:max(1, min(limit, 100))]
        items = []
        for event in selected:
            metadata = {}
            try: metadata = json.loads(event.metadata_json or "{}")
            except (TypeError, ValueError): pass
            summary = metadata.get("summary") if isinstance(metadata.get("summary"), str) else None
            items.append({"id": event.id, "title": event.action.replace("_", " ").title(), "category": event.category.upper(), "status": event.status.upper(), "severity": event.severity.upper(), "importance": event.importance.upper(), "source": event.source, "correlationId": event.correlation_id, "projectId": event.project_id, "workspaceId": event.workspace_id, "evidenceRef": event.evidence_ref, "occurredAt": event.occurred_at, "summary": summary})
        next_cursor = None
        if len(events) > len(selected) and selected:
            tail = selected[-1]; next_cursor = base64.urlsafe_b64encode(f"{tail.occurred_at}\0{tail.id}".encode()).decode()
        return {"items": items, "nextCursor": next_cursor}

engineering_presence_engine = EngineeringPresenceEngine()