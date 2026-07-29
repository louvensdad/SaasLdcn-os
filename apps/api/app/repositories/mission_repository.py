from __future__ import annotations

import json
import logging
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.core.config import get_settings
from app.core.database import connection as database_connection, database_url_for
from app.repositories.redaction import redact_value

logger = logging.getLogger("ldcn.mission_instances")

# Mission Workspace persistence (vault 38 - Missões). One row per mission,
# JSON-blob columns -- mirrors project_room_repository.py's convention rather
# than normalized sub-tables for answers/decisions/gaps/risks/artifacts.
#
# Isolation: every read/write is scoped by owner_user_id (foreign owner -> None
# -> 404 at the route, never a 403 that would leak existence).

MUTABLE_COLUMNS = (
    "title",
    "status",
    "mode",
    "experience_level",
    "degraded",
    "answers_json",
    "inputs_json",
    "journey_json",
    "decisions_json",
    "rejections_json",
    "derived_json",
    "gaps_json",
    "risks_json",
    "inconsistencies_json",
    "artifacts_json",
    "history_json",
    "operational_log_json",
    "last_failure_json",
    "version",
    "updated_at",
)


class MissionRepository:
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
        mission_type: str,
        title: str,
        mode: str = "guided",
        experience_level: str = "intermediate",
        workspace_id: str | None = None,
        journey: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = self._now()
        mission_id = f"mission_{uuid4().hex[:12]}"
        record = {
            "mission_id": mission_id,
            "owner_user_id": owner_user_id,
            "workspace_id": workspace_id,
            "mission_type": mission_type,
            "title": (title or "Nova Missão").strip()[:200] or "Nova Missão",
            "status": "active",
            "mode": mode or "guided",
            "experience_level": experience_level or "intermediate",
            "degraded": False,
            "answers_json": "{}",
            "inputs_json": "{}",
            "journey_json": self._dumps(journey or {}),
            "decisions_json": "[]",
            "rejections_json": "[]",
            "derived_json": "{}",
            "gaps_json": "[]",
            "risks_json": "[]",
            "inconsistencies_json": "[]",
            "artifacts_json": "[]",
            "history_json": "[]",
            "operational_log_json": "[]",
            "last_failure_json": None,
            "version": 1,
            "created_at": now,
            "updated_at": now,
        }
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO mission_instances (
                    mission_id, owner_user_id, workspace_id, mission_type, title, status, mode,
                    experience_level, degraded, answers_json, inputs_json, journey_json, decisions_json, rejections_json, derived_json,
                    gaps_json, risks_json, inconsistencies_json, artifacts_json,
                    history_json, operational_log_json, last_failure_json, version, created_at, updated_at
                ) VALUES (
                    :mission_id, :owner_user_id, :workspace_id, :mission_type, :title, :status, :mode,
                    :experience_level, :degraded, :answers_json, :inputs_json, :journey_json, :decisions_json, :rejections_json, :derived_json,
                    :gaps_json, :risks_json, :inconsistencies_json, :artifacts_json,
                    :history_json, :operational_log_json, :last_failure_json, :version, :created_at, :updated_at
                )
                """,
                record,
            )
        return self._row_to_mission(record)

    # ------------------------------------------------------------------- read
    def list_for_owner(self, owner_user_id: str) -> Sequence[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM mission_instances WHERE owner_user_id = ? ORDER BY updated_at DESC",
                (owner_user_id,),
            ).fetchall()
        result: list[dict[str, Any]] = []
        for row in rows:
            try:
                result.append(self._row_to_mission(dict(row)))
            except Exception:  # noqa: BLE001 — one corrupted row must not blank the owner's whole list
                logger.warning("mission_instances: skipped an unreadable row for owner %s", owner_user_id)
        return result

    def get_for_owner(self, mission_id: str, owner_user_id: str) -> dict[str, Any] | None:
        with self.connection() as conn:
            row = conn.execute(
                "SELECT * FROM mission_instances WHERE mission_id = ? AND owner_user_id = ?",
                (mission_id, owner_user_id),
            ).fetchone()
        return self._row_to_mission(dict(row)) if row else None

    # ----------------------------------------------------------------- mutate
    def autosave(self, mission_id: str, owner_user_id: str, changes: dict[str, Any]) -> dict[str, Any] | None:
        """Merges a partial PATCH payload. `changes` values are already JSON-
        serializable Python objects (dicts/lists) for the *_json columns --
        this method dumps them; callers never pre-serialize."""
        mission = self.get_for_owner(mission_id, owner_user_id)
        if mission is None:
            return None
        payload: dict[str, Any] = {}
        if "title" in changes and changes["title"] is not None:
            payload["title"] = changes["title"]
        if "status" in changes and changes["status"] is not None:
            payload["status"] = changes["status"]
        if "mode" in changes and changes["mode"] is not None:
            payload["mode"] = changes["mode"]
        if "context" in changes and changes["context"] is not None:
            context = changes["context"]
            payload["inputs_json"] = self._dumps(redact_value(context.get("inputs", {})))
            payload["answers_json"] = self._dumps(redact_value(context.get("answers", {})))
            payload["decisions_json"] = self._dumps(context.get("decisions", []))
            payload["rejections_json"] = self._dumps(context.get("rejections", []))
            payload["derived_json"] = self._dumps(redact_value(context.get("derived", {})))
            payload["history_json"] = self._dumps(context.get("history", []))
            payload["gaps_json"] = self._dumps(context.get("gaps", []))
            payload["risks_json"] = self._dumps(context.get("risks", []))
            payload["inconsistencies_json"] = self._dumps(context.get("inconsistencies", []))
        if "journey" in changes and changes["journey"] is not None:
            payload["journey_json"] = self._dumps(changes["journey"])
        payload["version"] = int(mission.get("version") or 1) + 1
        return self._save(mission_id, owner_user_id, payload)

    def append_artifact(self, mission_id: str, owner_user_id: str, artifact: dict[str, Any]) -> dict[str, Any] | None:
        mission = self.get_for_owner(mission_id, owner_user_id)
        if mission is None:
            return None
        artifacts = list(mission.get("artifacts") or [])
        artifacts.append(artifact)
        return self._save(mission_id, owner_user_id, {"artifacts_json": self._dumps(artifacts)})

    def set_degraded(self, mission_id: str, owner_user_id: str, degraded: bool) -> dict[str, Any] | None:
        return self._save(mission_id, owner_user_id, {"degraded": bool(degraded)})

    def update_status(self, mission_id: str, owner_user_id: str, status: str) -> dict[str, Any] | None:
        return self._save(mission_id, owner_user_id, {"status": status})

    def append_operation(self, mission_id: str, owner_user_id: str, entry: dict[str, Any]) -> dict[str, Any] | None:
        mission = self.get_for_owner(mission_id, owner_user_id)
        if mission is None:
            return None
        log = list(mission.get("operational_log") or [])
        log.append(entry)
        return self._save(mission_id, owner_user_id, {"operational_log_json": self._dumps(log[-100:])})

    def delete_for_owner(self, mission_id: str, owner_user_id: str) -> bool:
        with self.connection() as conn:
            result = conn.execute(
                "DELETE FROM mission_instances WHERE mission_id = ? AND owner_user_id = ?",
                (mission_id, owner_user_id),
            )
        return result.rowcount > 0

    # --------------------------------------------------------------- internal
    def _save(self, mission_id: str, owner_user_id: str, changes: dict[str, Any]) -> dict[str, Any] | None:
        changes = {key: value for key, value in changes.items() if key in MUTABLE_COLUMNS}
        changes["updated_at"] = self._now()
        assignments = ", ".join(f"{column} = :{column}" for column in changes)
        params = {**changes, "mission_id": mission_id, "owner_user_id": owner_user_id}
        with self.connection() as conn:
            result = conn.execute(
                f"UPDATE mission_instances SET {assignments} WHERE mission_id = :mission_id AND owner_user_id = :owner_user_id",
                params,
            )
            if result.rowcount == 0:
                return None
        return self.get_for_owner(mission_id, owner_user_id)

    def _row_to_mission(self, row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": row["mission_id"],
            "owner_user_id": row["owner_user_id"],
            "workspace_id": row.get("workspace_id"),
            "type": row["mission_type"],
            "title": row["title"],
            "status": row.get("status") or "active",
            "mode": row.get("mode") or "guided",
            "experience_level": row.get("experience_level") or "intermediate",
            "degraded": bool(row.get("degraded")),
            "context": {
                "inputs": self._loads(row.get("inputs_json")) or {},
                "answers": self._loads(row.get("answers_json")) or {},
                "decisions": self._loads(row.get("decisions_json")) or [],
                "rejections": self._loads(row.get("rejections_json")) or [],
                "gaps": self._loads(row.get("gaps_json")) or [],
                "risks": self._loads(row.get("risks_json")) or [],
                "inconsistencies": self._loads(row.get("inconsistencies_json")) or [],
                "history": self._loads(row.get("history_json")) or [],
                "derived": self._loads(row.get("derived_json")) or {},
            },
            "journey": self._loads(row.get("journey_json")) or {"step_ids": [], "current_step_id": None, "progress": 0, "steps": []},
            "artifacts": self._loads(row.get("artifacts_json")) or [],
            "history": self._loads(row.get("history_json")) or [],
            "operational_log": self._loads(row.get("operational_log_json")) or [],
            "last_failure": self._loads(row.get("last_failure_json")) or None,
            "version": int(row.get("version") or 1),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    @staticmethod
    def _now() -> str:
        return datetime.now(UTC).replace(microsecond=0).isoformat()

    @staticmethod
    def _dumps(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False)

    @staticmethod
    def _loads(value: str | None) -> Any:
        if not value:
            return None
        try:
            return json.loads(value)
        except (TypeError, ValueError):
            logger.warning("mission_instances: failed to decode a JSON column; treating as empty")
            return None
