from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.core.database import database_url_for, session_factory
from app.core.security import decrypt_secret, encrypt_secret
from app.models.automation import Automation, AutomationCredential, AutomationRun


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class AutomationRepository:
    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self._sessions = session_factory(self.database_url)

    # ------------------------------------------------------------- Automation
    def create(
        self, *, owner_user_id: str, title: str, workspace_id: str | None = None, description: str = "",
        trigger_type: str = "manual", trigger_config: dict | None = None,
        action_type: str = "http_request", action_config: dict | None = None,
    ) -> dict[str, Any]:
        now = _now()
        row = Automation(
            id=f"auto_{uuid4().hex[:12]}", owner_user_id=owner_user_id, workspace_id=workspace_id,
            title=title, description=description, trigger_type=trigger_type,
            trigger_config_json=json.dumps(trigger_config or {}, ensure_ascii=False), next_run_at=None,
            action_type=action_type, action_config_json=json.dumps(action_config or {}, ensure_ascii=False),
            status="draft", created_at=now, updated_at=now,
        )
        with self._sessions.begin() as session:
            session.add(row)
        return self._as_dict(row)

    def get_for_owner(self, automation_id: str, owner_user_id: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            row = session.get(Automation, automation_id)
            if row is None or row.owner_user_id != owner_user_id:
                return None
            return self._as_dict(row)

    def list_for_owner(self, owner_user_id: str) -> list[dict[str, Any]]:
        with self._sessions() as session:
            rows = session.scalars(
                select(Automation).where(Automation.owner_user_id == owner_user_id).order_by(Automation.created_at.desc())
            ).all()
        return [self._as_dict(row) for row in rows]

    def list_due(self, *, before: str) -> list[dict[str, Any]]:
        """Real query the scheduler polls: active, scheduled automations whose
        next_run_at has passed. Never returns manual-trigger or non-active rows."""
        with self._sessions() as session:
            rows = session.scalars(
                select(Automation).where(
                    Automation.trigger_type == "scheduled", Automation.status == "active",
                    Automation.next_run_at.is_not(None), Automation.next_run_at <= before,
                )
            ).all()
        return [self._as_dict(row) for row in rows]

    def set_status(self, automation_id: str, owner_user_id: str, status: str) -> dict[str, Any] | None:
        with self._sessions.begin() as session:
            row = session.get(Automation, automation_id)
            if row is None or row.owner_user_id != owner_user_id:
                return None
            row.status = status
            row.updated_at = _now()
            session.flush()
            return self._as_dict(row)

    def set_next_run_at(self, automation_id: str, next_run_at: str | None) -> None:
        with self._sessions.begin() as session:
            row = session.get(Automation, automation_id)
            if row is not None:
                row.next_run_at = next_run_at
                row.updated_at = _now()

    def delete_for_owner(self, automation_id: str, owner_user_id: str) -> bool:
        with self._sessions.begin() as session:
            row = session.get(Automation, automation_id)
            if row is None or row.owner_user_id != owner_user_id:
                return False
            session.delete(row)
            return True

    @staticmethod
    def _as_dict(row: Automation) -> dict[str, Any]:
        return {
            "id": row.id, "owner_user_id": row.owner_user_id, "workspace_id": row.workspace_id,
            "title": row.title, "description": row.description, "trigger_type": row.trigger_type,
            "trigger_config": json.loads(row.trigger_config_json or "{}"), "next_run_at": row.next_run_at,
            "action_type": row.action_type, "action_config": json.loads(row.action_config_json or "{}"),
            "status": row.status, "created_at": row.created_at, "updated_at": row.updated_at,
        }

    # ---------------------------------------------------------- Credentials
    def set_credential(self, automation_id: str, owner_user_id: str, name: str, value: str) -> dict[str, Any]:
        """Upsert by (automation_id, name) -- setting a credential with the
        same name replaces the encrypted value rather than piling up rows."""
        now = _now()
        with self._sessions.begin() as session:
            existing = session.scalars(
                select(AutomationCredential).where(
                    AutomationCredential.automation_id == automation_id, AutomationCredential.name == name,
                )
            ).first()
            if existing is not None:
                existing.encrypted_value = encrypt_secret(value)
                existing.updated_at = now
                session.flush()
                return self._credential_as_dict(existing)
            row = AutomationCredential(
                id=f"autocred_{uuid4().hex[:12]}", automation_id=automation_id, owner_user_id=owner_user_id,
                name=name, encrypted_value=encrypt_secret(value), created_at=now, updated_at=now,
            )
            session.add(row)
            session.flush()
            return self._credential_as_dict(row)

    def list_credentials(self, automation_id: str) -> list[dict[str, Any]]:
        """Never includes the decrypted (or even encrypted) value -- see
        resolve_credentials() for the one place plaintext is read, at
        execution time only."""
        with self._sessions() as session:
            rows = session.scalars(
                select(AutomationCredential).where(AutomationCredential.automation_id == automation_id)
            ).all()
        return [self._credential_as_dict(row) for row in rows]

    def resolve_credentials(self, automation_id: str) -> dict[str, str]:
        """The ONLY function in this repository that returns decrypted values
        -- called exclusively by automation_engine.resolve_action_config() at
        execution time, never exposed through any API response."""
        with self._sessions() as session:
            rows = session.scalars(
                select(AutomationCredential).where(AutomationCredential.automation_id == automation_id)
            ).all()
        return {row.name: decrypt_secret(row.encrypted_value) for row in rows}

    def delete_credential(self, automation_id: str, name: str) -> bool:
        with self._sessions.begin() as session:
            row = session.scalars(
                select(AutomationCredential).where(
                    AutomationCredential.automation_id == automation_id, AutomationCredential.name == name,
                )
            ).first()
            if row is None:
                return False
            session.delete(row)
            return True

    @staticmethod
    def _credential_as_dict(row: AutomationCredential) -> dict[str, Any]:
        return {"id": row.id, "automation_id": row.automation_id, "name": row.name, "created_at": row.created_at, "updated_at": row.updated_at}

    # ---------------------------------------------------------------- Runs
    def start_run(self, automation_id: str, owner_user_id: str, *, trigger_source: str) -> dict[str, Any]:
        row = AutomationRun(
            id=f"autorun_{uuid4().hex[:12]}", automation_id=automation_id, owner_user_id=owner_user_id,
            trigger_source=trigger_source, status="running", started_at=_now(), retry_count=0,
        )
        with self._sessions.begin() as session:
            session.add(row)
        return self._run_as_dict(row)

    def finish_run(
        self, run_id: str, *, status: str, masked_request: dict | None, response_status_code: int | None,
        masked_response: dict | None, error: str | None, retry_count: int,
    ) -> dict[str, Any] | None:
        with self._sessions.begin() as session:
            row = session.get(AutomationRun, run_id)
            if row is None:
                return None
            finished_at = _now()
            started = datetime.fromisoformat(row.started_at)
            finished = datetime.fromisoformat(finished_at)
            row.status = status
            row.finished_at = finished_at
            row.duration_ms = int((finished - started).total_seconds() * 1000)
            row.masked_request_json = json.dumps(masked_request, ensure_ascii=False) if masked_request is not None else None
            row.response_status_code = response_status_code
            row.masked_response_json = json.dumps(masked_response, ensure_ascii=False) if masked_response is not None else None
            row.error = error
            row.retry_count = retry_count
            session.flush()
            return self._run_as_dict(row)

    def list_runs(self, automation_id: str, owner_user_id: str, *, limit: int = 50) -> list[dict[str, Any]]:
        with self._sessions() as session:
            rows = session.scalars(
                select(AutomationRun)
                .where(AutomationRun.automation_id == automation_id, AutomationRun.owner_user_id == owner_user_id)
                .order_by(AutomationRun.started_at.desc()).limit(limit)
            ).all()
        return [self._run_as_dict(row) for row in rows]

    @staticmethod
    def _run_as_dict(row: AutomationRun) -> dict[str, Any]:
        return {
            "id": row.id, "automation_id": row.automation_id, "trigger_source": row.trigger_source,
            "status": row.status, "started_at": row.started_at, "finished_at": row.finished_at,
            "duration_ms": row.duration_ms,
            "masked_request": json.loads(row.masked_request_json) if row.masked_request_json else None,
            "response_status_code": row.response_status_code,
            "masked_response": json.loads(row.masked_response_json) if row.masked_response_json else None,
            "error": row.error, "retry_count": row.retry_count,
        }
