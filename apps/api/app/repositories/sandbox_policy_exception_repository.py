from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.core.database import database_url_for, session_factory
from app.models.sandbox_policy_exception import SandboxPolicyException


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class SandboxPolicyExceptionRepository:
    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self._sessions = session_factory(self.database_url)

    def create(self, *, project_id: str, program: str, reason: str, approved_by_user_id: str, expires_at: str) -> dict[str, Any]:
        row = SandboxPolicyException(
            id=f"sbxexc_{uuid4().hex[:12]}", project_id=project_id, program=program, reason=reason,
            approved_by_user_id=approved_by_user_id, created_at=_now(), expires_at=expires_at, revoked_at=None,
        )
        with self._sessions.begin() as session:
            session.add(row)
        return self._as_dict(row)

    def is_program_allowed(self, project_id: str, program: str) -> bool:
        """The one query execution_runtime.py's _validate_request needs: is
        there a live (not expired, not revoked) exception for this exact
        project+program? Real time comparison, not a cached/stale flag."""
        now = _now()
        with self._sessions() as session:
            row = session.scalars(
                select(SandboxPolicyException).where(
                    SandboxPolicyException.project_id == project_id,
                    SandboxPolicyException.program == program,
                    SandboxPolicyException.revoked_at.is_(None),
                    SandboxPolicyException.expires_at > now,
                )
            ).first()
            return row is not None

    def list_for_project(self, project_id: str) -> list[dict[str, Any]]:
        with self._sessions() as session:
            rows = session.scalars(
                select(SandboxPolicyException)
                .where(SandboxPolicyException.project_id == project_id)
                .order_by(SandboxPolicyException.created_at.desc())
            ).all()
        return [self._as_dict(row) for row in rows]

    def get(self, exception_id: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            row = session.get(SandboxPolicyException, exception_id)
            return self._as_dict(row) if row is not None else None

    def revoke(self, exception_id: str) -> dict[str, Any] | None:
        with self._sessions.begin() as session:
            row = session.get(SandboxPolicyException, exception_id)
            if row is None or row.revoked_at is not None:
                return None
            row.revoked_at = _now()
            session.flush()
            return self._as_dict(row)

    @staticmethod
    def _as_dict(row: SandboxPolicyException) -> dict[str, Any]:
        return {
            "id": row.id, "project_id": row.project_id, "program": row.program, "reason": row.reason,
            "approved_by_user_id": row.approved_by_user_id, "created_at": row.created_at,
            "expires_at": row.expires_at, "revoked_at": row.revoked_at,
        }
