from __future__ import annotations

import json
import logging
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.core.database import connection as database_connection, database_url_for
from app.core.config import get_settings
from app.repositories.redaction import redact_text

logger = logging.getLogger("ldcn.change_requests")


# Change Request persistence -- an incremental-change request against an
# already-generated project (patch/diff/build/preview/approve/rollback).
#
# Isolation: every read/write is scoped by owner_user_id, mirroring
# ProjectRoomRepository -- a foreign owner simply yields None -> 404 at the route.
#
# project_id here is the GENERATED-PROJECT id (generated-projects/active/{id}/),
# not a project_room room_id and not the legacy `projects` table -- patch/diff/
# build/rollback only make sense against real files on disk.

MUTABLE_COLUMNS = (
    "base_version",
    "status",
    "classification_json",
    "scope_json",
    "impact_json",
    "snapshot_json",
    "diff_json",
    "build_result_json",
    "preview_result_json",
    "approval_json",
    "result_json",
    "history_json",
    "operational_log_json",
    "last_failure_json",
    "updated_at",
)


class ChangeRequestRepository:
    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self.sqlite_path = database if isinstance(database, Path) else get_settings().sqlite_path

    def connection(self):
        return database_connection(self.database_url)

    def initialize(self) -> None:
        """Schema creation is owned by Alembic."""
        return None

    # ----------------------------------------------------------------- create
    def create(
        self,
        *,
        owner_user_id: str,
        project_id: str,
        intent: str,
        workspace_id: str | None = None,
        room_id: str | None = None,
        feature_id: str | None = None,
        task_id: str | None = None,
    ) -> dict[str, Any]:
        now = self._now()
        change_request_id = f"cr_{uuid4().hex[:12]}"
        record = {
            "change_request_id": change_request_id,
            "owner_user_id": owner_user_id,
            "workspace_id": workspace_id,
            "project_id": project_id,
            "room_id": room_id,
            "feature_id": feature_id,
            "task_id": task_id,
            "base_version": None,
            "status": "Draft",
            "intent": redact_text(intent or ""),
            "classification_json": None,
            "scope_json": "[]",
            "impact_json": None,
            "snapshot_json": None,
            "diff_json": None,
            "build_result_json": None,
            "preview_result_json": None,
            "approval_json": None,
            "result_json": None,
            "history_json": "[]",
            "operational_log_json": "[]",
            "last_failure_json": None,
            "created_at": now,
            "updated_at": now,
        }
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO change_requests (
                    change_request_id, owner_user_id, workspace_id, project_id, room_id, feature_id, task_id,
                    base_version, status, intent, classification_json, scope_json, impact_json, snapshot_json,
                    diff_json, build_result_json, preview_result_json, approval_json, result_json,
                    history_json, operational_log_json, last_failure_json, created_at, updated_at
                ) VALUES (
                    :change_request_id, :owner_user_id, :workspace_id, :project_id, :room_id, :feature_id, :task_id,
                    :base_version, :status, :intent, :classification_json, :scope_json, :impact_json, :snapshot_json,
                    :diff_json, :build_result_json, :preview_result_json, :approval_json, :result_json,
                    :history_json, :operational_log_json, :last_failure_json, :created_at, :updated_at
                )
                """,
                record,
            )
        return self._row_to_cr(record)

    # ------------------------------------------------------------------- read
    def list_for_owner(self, owner_user_id: str) -> Sequence[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM change_requests WHERE owner_user_id = ? ORDER BY updated_at DESC",
                (owner_user_id,),
            ).fetchall()
        return self._rows_to_list(rows, owner_user_id)

    def list_for_project(self, project_id: str, owner_user_id: str) -> Sequence[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM change_requests WHERE project_id = ? AND owner_user_id = ? ORDER BY updated_at DESC",
                (project_id, owner_user_id),
            ).fetchall()
        return self._rows_to_list(rows, owner_user_id)

    def get_for_owner(self, change_request_id: str, owner_user_id: str) -> dict[str, Any] | None:
        with self.connection() as conn:
            row = conn.execute(
                "SELECT * FROM change_requests WHERE change_request_id = ? AND owner_user_id = ?",
                (change_request_id, owner_user_id),
            ).fetchone()
        return self._row_to_cr(dict(row)) if row else None

    # ----------------------------------------------------------------- mutate
    def set_classification(
        self,
        change_request_id: str,
        owner_user_id: str,
        classification: dict[str, Any],
        *,
        status: str = "Analyzed",
    ) -> dict[str, Any] | None:
        return self._save(change_request_id, owner_user_id, {
            "classification_json": self._dumps(classification),
            "status": status,
        })

    def set_scope_and_impact(
        self,
        change_request_id: str,
        owner_user_id: str,
        scope: list[str],
        impact: dict[str, Any],
        *,
        base_version: str | None = None,
        status: str = "Planned",
    ) -> dict[str, Any] | None:
        changes: dict[str, Any] = {
            "scope_json": self._dumps(scope),
            "impact_json": self._dumps(impact),
            "status": status,
        }
        if base_version is not None:
            changes["base_version"] = base_version
        return self._save(change_request_id, owner_user_id, changes)

    def set_approval(
        self,
        change_request_id: str,
        owner_user_id: str,
        approval: dict[str, Any],
        *,
        status: str = "Approved",
    ) -> dict[str, Any] | None:
        return self._save(change_request_id, owner_user_id, {
            "approval_json": self._dumps(approval),
            "status": status,
        })

    def set_snapshot(
        self,
        change_request_id: str,
        owner_user_id: str,
        snapshot: dict[str, Any],
        *,
        status: str | None = None,
    ) -> dict[str, Any] | None:
        changes: dict[str, Any] = {"snapshot_json": self._dumps(snapshot)}
        if status is not None:
            changes["status"] = status
        return self._save(change_request_id, owner_user_id, changes)

    def set_diff(
        self,
        change_request_id: str,
        owner_user_id: str,
        diff: list[dict[str, Any]],
        *,
        status: str = "Applying",
    ) -> dict[str, Any] | None:
        return self._save(change_request_id, owner_user_id, {
            "diff_json": self._dumps(diff),
            "status": status,
        })

    def set_build_result(
        self,
        change_request_id: str,
        owner_user_id: str,
        report: dict[str, Any],
        *,
        status: str | None = None,
    ) -> dict[str, Any] | None:
        changes: dict[str, Any] = {"build_result_json": self._dumps(report)}
        if status is not None:
            changes["status"] = status
        return self._save(change_request_id, owner_user_id, changes)

    def set_preview_result(
        self,
        change_request_id: str,
        owner_user_id: str,
        report: dict[str, Any],
        *,
        status: str = "Validating",
    ) -> dict[str, Any] | None:
        return self._save(change_request_id, owner_user_id, {
            "preview_result_json": self._dumps(report),
            "status": status,
        })

    def set_result(
        self,
        change_request_id: str,
        owner_user_id: str,
        result: dict[str, Any],
        *,
        status: str,
    ) -> dict[str, Any] | None:
        return self._save(change_request_id, owner_user_id, {
            "result_json": self._dumps(result),
            "status": status,
        })

    def update_status(self, change_request_id: str, owner_user_id: str, status: str) -> dict[str, Any] | None:
        return self._save(change_request_id, owner_user_id, {"status": status})

    def append_history(
        self,
        change_request_id: str,
        owner_user_id: str,
        event: dict[str, Any],
    ) -> dict[str, Any] | None:
        cr = self.get_for_owner(change_request_id, owner_user_id)
        if cr is None:
            return None
        history = list(cr.get("history") or [])
        history.append(event)
        return self._save(change_request_id, owner_user_id, {"history_json": self._dumps(history)})

    def append_operation(
        self,
        change_request_id: str,
        owner_user_id: str,
        entry: dict[str, Any],
    ) -> dict[str, Any] | None:
        cr = self.get_for_owner(change_request_id, owner_user_id)
        if cr is None:
            return None
        log = list(cr.get("operational_log") or [])
        log.append(entry)
        return self._save(change_request_id, owner_user_id, {"operational_log_json": self._dumps(log[-100:])})

    def set_last_failure(
        self,
        change_request_id: str,
        owner_user_id: str,
        failure: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        return self._save(
            change_request_id,
            owner_user_id,
            {"last_failure_json": self._dumps(failure) if failure else None},
        )

    def delete_for_owner(self, change_request_id: str, owner_user_id: str) -> bool:
        with self.connection() as conn:
            result = conn.execute(
                "DELETE FROM change_requests WHERE change_request_id = ? AND owner_user_id = ?",
                (change_request_id, owner_user_id),
            )
        return result.rowcount > 0

    # --------------------------------------------------------------- internal
    def _rows_to_list(self, rows: Sequence[Any], owner_user_id: str) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        for row in rows:
            try:
                result.append(self._row_to_cr(dict(row)))
            except Exception:  # noqa: BLE001 — one corrupted row must not blank the owner's whole list
                logger.warning("change_requests: skipped an unreadable row for owner %s", owner_user_id)
        return result

    def _save(self, change_request_id: str, owner_user_id: str, changes: dict[str, Any]) -> dict[str, Any] | None:
        changes = {key: value for key, value in changes.items() if key in MUTABLE_COLUMNS}
        changes["updated_at"] = self._now()
        assignments = ", ".join(f"{column} = :{column}" for column in changes)
        params = {**changes, "change_request_id": change_request_id, "owner_user_id": owner_user_id}
        with self.connection() as conn:
            result = conn.execute(
                f"UPDATE change_requests SET {assignments} "
                "WHERE change_request_id = :change_request_id AND owner_user_id = :owner_user_id",
                params,
            )
            if result.rowcount == 0:
                return None
        return self.get_for_owner(change_request_id, owner_user_id)

    def _row_to_cr(self, row: dict[str, Any]) -> dict[str, Any]:
        return {
            "change_request_id": row["change_request_id"],
            "owner_user_id": row["owner_user_id"],
            "workspace_id": row.get("workspace_id"),
            "project_id": row["project_id"],
            "room_id": row.get("room_id"),
            "feature_id": row.get("feature_id"),
            "task_id": row.get("task_id"),
            "base_version": row.get("base_version"),
            "status": row["status"],
            "intent": row.get("intent") or "",
            "classification": self._loads(row.get("classification_json")) or None,
            "scope": self._loads(row.get("scope_json")) or [],
            "impact": self._loads(row.get("impact_json")) or None,
            "snapshot": self._loads(row.get("snapshot_json")) or None,
            "diff": self._loads(row.get("diff_json")) or [],
            "build_result": self._loads(row.get("build_result_json")) or None,
            "preview_result": self._loads(row.get("preview_result_json")) or None,
            "approval": self._loads(row.get("approval_json")) or None,
            "result": self._loads(row.get("result_json")) or None,
            "history": self._loads(row.get("history_json")) or [],
            "operational_log": self._loads(row.get("operational_log_json")) or [],
            "last_failure": self._loads(row.get("last_failure_json")) or None,
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    @staticmethod
    def _now() -> str:
        return datetime.now(UTC).replace(microsecond=0).isoformat()

    @staticmethod
    def _dumps(value: Any) -> str:
        # Unlike ProjectRoomRepository, this does NOT run redact_value() here:
        # snapshot_json/diff_json hold literal generated-file content that must
        # round-trip byte-exact for rollback to work. Secret-like generated
        # content is already blocked (403, never mutated) upstream at capture
        # time by GeneratedProjectService.read_file's _contains_secret_value
        # check -- redacting again here would silently corrupt legitimate code
        # (e.g. `password = ...` in a real auth form) rather than protect it.
        return json.dumps(value, ensure_ascii=False)

    @staticmethod
    def _loads(value: str | None) -> Any:
        if not value:
            return None
        try:
            return json.loads(value)
        except (TypeError, ValueError):
            logger.warning("change_requests: failed to decode a JSON column; treating as empty")
            return None
