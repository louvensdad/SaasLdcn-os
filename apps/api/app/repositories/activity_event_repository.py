from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import text
from app.core.database import connection, session_factory


class ActivityEventRepository:
    def create(self, *, user_id: str, workspace_id: str | None, project_id: str | None,
               category: str, action: str, status: str, metadata: dict[str, Any],
               source: str, correlation_id: str, severity: str = "INFO",
               importance: str = "NORMAL", evidence_ref: str | None = None,
               resolved_at: str | None = None) -> dict[str, Any]:
        event = {"id": uuid4().hex, "user_id": user_id, "workspace_id": workspace_id,
                 "project_id": project_id, "category": category, "action": action,
                 "status": status, "metadata_json": json.dumps(metadata, ensure_ascii=False, separators=(",", ":")),
                 "occurred_at": datetime.now(timezone.utc).isoformat(), "source": source,
                 "correlation_id": correlation_id, "severity": severity, "importance": importance,
                 "evidence_ref": evidence_ref, "resolved_at": resolved_at}
        columns = ",".join(event)
        placeholders = ",".join(f":{key}" for key in event)
        with session_factory()() as session:
            session.execute(text(f"INSERT INTO activity_events ({columns}) VALUES ({placeholders})"), event)
            session.commit()
        return event

    def list_for_user(self, user_id: str, *, workspace_id: str | None, limit: int, cursor: tuple[str, str] | None = None,
                      category: str | None = None, status: str | None = None,
                      severity: str | None = None, project_id: str | None = None,
                      from_date: str | None = None, to_date: str | None = None,
                      search: str | None = None, sort: str = "desc") -> list[dict[str, Any]]:
        clauses = ["user_id = :user_id"]
        params: dict[str, Any] = {"user_id": user_id, "limit": limit + 1}
        if workspace_id:
            clauses.append("workspace_id = :workspace_id"); params["workspace_id"] = workspace_id
        if cursor:
            operator = "<" if sort == "desc" else ">"
            clauses.append(f"(occurred_at {operator} :cursor_at OR (occurred_at = :cursor_at AND id {operator} :cursor_id))")
            params.update(cursor_at=cursor[0], cursor_id=cursor[1])
        if category: clauses.append("category = :category"); params["category"] = category
        if status: clauses.append("status = :status"); params["status"] = status
        if severity: clauses.append("severity = :severity"); params["severity"] = severity
        if project_id: clauses.append("project_id = :project_id"); params["project_id"] = project_id
        if from_date: clauses.append("occurred_at >= :from_date"); params["from_date"] = from_date
        if to_date: clauses.append("occurred_at <= :to_date"); params["to_date"] = to_date
        if search:
            clauses.append("(action LIKE :search OR category LIKE :search OR metadata_json LIKE :search)"); params["search"] = f"%{search[:100]}%"
        direction = "DESC" if sort == "desc" else "ASC"
        query = text(f"SELECT * FROM activity_events WHERE {' AND '.join(clauses)} ORDER BY occurred_at {direction}, id {direction} LIMIT :limit")
        with session_factory()() as session:
            return [dict(row) for row in session.execute(query, params).mappings().all()]

    def get_for_user(self, user_id: str, event_id: str, workspace_id: str | None) -> dict[str, Any] | None:
        with session_factory()() as session:
            row = session.execute(text("SELECT * FROM activity_events WHERE user_id = :user_id AND id = :id AND (:workspace_id IS NULL OR workspace_id = :workspace_id)"), {"user_id": user_id, "id": event_id, "workspace_id": workspace_id}).mappings().first()
            return dict(row) if row else None


activity_event_repository = ActivityEventRepository()