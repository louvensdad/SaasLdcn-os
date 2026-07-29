from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import database_url_for, session_factory
from app.models.persistence import BlueprintApproval


def hash_blueprint(blueprint: dict[str, Any]) -> str:
    """Deterministic content hash of a blueprint snapshot. Uses the same
    canonicalization as ProjectRepository._serialize_json so the hash is stable
    and comparable to what's persisted in blueprint_snapshot_json."""
    canonical = json.dumps(blueprint, ensure_ascii=True, sort_keys=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class BlueprintApprovalRepository:
    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self.sqlite_path = database if isinstance(database, Path) else get_settings().sqlite_path
        self._sessions = session_factory(self.database_url)

    def record(
        self, *, project_id: str, blueprint_hash: str, approved_by_user_id: str, reason: str | None = None
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        row = BlueprintApproval(
            approval_id=f"approval_{uuid4().hex[:12]}",
            project_id=project_id,
            blueprint_hash=blueprint_hash,
            approved_by_user_id=approved_by_user_id,
            reason=reason,
            created_at=now,
            revoked_at=None,
        )
        with self._sessions.begin() as session:
            session.add(row)
        return self._row(row)

    def latest_for_project(self, project_id: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            row = session.scalar(
                select(BlueprintApproval)
                .where(BlueprintApproval.project_id == project_id, BlueprintApproval.revoked_at.is_(None))
                .order_by(BlueprintApproval.created_at.desc())
                .limit(1)
            )
            return self._row(row) if row else None

    def is_approved(self, project_id: str, blueprint_hash: str) -> bool:
        with self._sessions() as session:
            row = session.scalar(
                select(BlueprintApproval).where(
                    BlueprintApproval.project_id == project_id,
                    BlueprintApproval.blueprint_hash == blueprint_hash,
                    BlueprintApproval.revoked_at.is_(None),
                )
            )
            return row is not None

    def revoke(self, approval_id: str, actor_user_id: str) -> bool:
        with self._sessions.begin() as session:
            row = session.get(BlueprintApproval, approval_id)
            if row is None or row.revoked_at is not None:
                return False
            row.revoked_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        return True

    @staticmethod
    def _row(row: BlueprintApproval) -> dict[str, Any]:
        return {
            "approval_id": row.approval_id,
            "project_id": row.project_id,
            "blueprint_hash": row.blueprint_hash,
            "approved_by_user_id": row.approved_by_user_id,
            "reason": row.reason,
            "created_at": row.created_at,
            "revoked_at": row.revoked_at,
        }
