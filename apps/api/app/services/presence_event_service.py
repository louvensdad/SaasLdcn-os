from __future__ import annotations

from typing import Any
from app.repositories.activity_event_repository import activity_event_repository
from app.core.database import session_factory
from app.models.persistence import GenerationJob
from sqlalchemy import select
from app.services.activity_feed_service import sanitize_metadata


def record_event(*, user_id: str, workspace_id: str | None, project_id: str | None, category: str, action: str, status: str, source: str, correlation_id: str, severity: str = "INFO", importance: str = "NORMAL", evidence_ref: str | None = None, metadata: dict[str, Any] | None = None) -> None:
    activity_event_repository.create(user_id=user_id, workspace_id=workspace_id, project_id=project_id, category=category, action=action, status=status, metadata=sanitize_metadata(metadata or {}), source=source, correlation_id=correlation_id, severity=severity, importance=importance, evidence_ref=evidence_ref)




def owner_for_job(job_id: str) -> str:
    if not job_id: return "system"
    with session_factory()() as session:
        return session.scalar(select(GenerationJob.owner_user_id).where(GenerationJob.id == job_id)) or "system"


def sandbox_lifecycle(*, user_id: str, workspace_id: str | None, project_id: str | None, action: str, correlation_id: str, severity: str = "INFO") -> None:
    record_event(user_id=user_id or "system", workspace_id=workspace_id, project_id=project_id, category="SANDBOX", action=action, status="success", source="sandbox_runtime", correlation_id=correlation_id, severity=severity, importance="NORMAL")
def sandbox_result(*, user_id: str, workspace_id: str | None, project_id: str | None, execution_id: str, status: str, reason: str = "") -> None:
    mapping = {"SUCCEEDED": ("execution_completed", "SUCCESS", "NORMAL"), "TIMED_OUT": ("execution_timeout", "WARNING", "HIGH"), "RESOURCE_LIMIT_EXCEEDED": ("resource_limit_exceeded", "ERROR", "BLOCKING"), "SECURITY_BLOCKED": ("security_blocked", "CRITICAL", "BLOCKING"), "CANCELLED": ("execution_cancelled", "INFO", "NORMAL"), "FAILED": ("execution_failed", "ERROR", "HIGH"), "SANDBOX_ERROR": ("sandbox_failed", "ERROR", "BLOCKING")}
    action, severity, importance = mapping.get(status, ("execution_completed", "INFO", "NORMAL"))
    record_event(user_id=user_id or "system", workspace_id=workspace_id, project_id=project_id, category="SANDBOX", action=action, status=status, source="sandbox_runtime", correlation_id=execution_id, severity=severity, importance=importance, metadata={"summary": reason[:300]} if reason else {})