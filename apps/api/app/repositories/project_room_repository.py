from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.core.config import get_settings
from app.core.database import connection as database_connection, database_url_for
from app.repositories.redaction import redact_text, redact_value


# AI Project Room persistence. Each room is a ChatGPT-style conversation that the
# orchestrator turns into a ProjectSpec and then into a versioned PromptMaster.md.
#
# Isolation: every read/write is scoped by owner_user_id, so user A can never see
# or mutate user B's rooms (a foreign owner simply yields None -> 404 at the route).
# A nullable workspace_id is reserved for a future real workspace model.
#
# Security: chat content, the spec and the handoff are redacted before they hit
# disk; an API key is never persisted here in any form.

MUTABLE_COLUMNS = (
    "title",
    "status",
    "raw_intent",
    "locale",
    "confidence",
    "degraded",
    "spec_json",
    "messages_json",
    "prompt_master_md",
    "prompt_master_versions_json",
    "architecture_blueprint_json",
    "blueprint_versions_json",
    "active_blueprint_version",
    "generation_handoff_json",
    "history_json",
    "operational_log_json",
    "last_failure_json",
    "updated_at",
)


class ProjectRoomRepository:
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
        title: str,
        locale: str = "pt-BR",
        raw_intent: str = "",
        workspace_id: str | None = None,
        delivery_type: str = "web",
        preferred_language: str = "",
    ) -> dict[str, Any]:
        now = self._now()
        room_id = f"room_{uuid4().hex[:12]}"
        record = {
            "room_id": room_id,
            "owner_user_id": owner_user_id,
            "workspace_id": workspace_id,
            "title": (title or "Nova CriaÃ§Ã£o").strip()[:200] or "Nova CriaÃ§Ã£o",
            "status": "DRAFT",
            "delivery_type": delivery_type or "web",
            "preferred_language": preferred_language or "",
            "raw_intent": redact_text(raw_intent or ""),
            "locale": locale or "pt-BR",
            "confidence": 0.0,
            "degraded": False,
            "spec_json": None,
            "messages_json": "[]",
            "prompt_master_md": None,
            "prompt_master_versions_json": "[]",
            "architecture_blueprint_json": None,
            "blueprint_versions_json": "[]",
            "active_blueprint_version": None,
            "generation_handoff_json": None,
            "history_json": "[]",
            "operational_log_json": "[]",
            "last_failure_json": None,
            "created_at": now,
            "updated_at": now,
        }
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO project_rooms (
                    room_id, owner_user_id, workspace_id, title, status, delivery_type, preferred_language, raw_intent, locale,
                    confidence, degraded, spec_json, messages_json, prompt_master_md,
                    prompt_master_versions_json, architecture_blueprint_json, blueprint_versions_json, active_blueprint_version,
                    generation_handoff_json, history_json, operational_log_json, last_failure_json, created_at, updated_at
                ) VALUES (
                    :room_id, :owner_user_id, :workspace_id, :title, :status, :delivery_type, :preferred_language, :raw_intent, :locale,
                    :confidence, :degraded, :spec_json, :messages_json, :prompt_master_md,
                    :prompt_master_versions_json, :architecture_blueprint_json, :blueprint_versions_json, :active_blueprint_version,
                    :generation_handoff_json, :history_json, :operational_log_json, :last_failure_json, :created_at, :updated_at
                )
                """,
                record,
            )
        return self._row_to_room(record)

    # ------------------------------------------------------------------- read
    def list_for_owner(self, owner_user_id: str) -> Sequence[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute(
                "SELECT * FROM project_rooms WHERE owner_user_id = ? ORDER BY updated_at DESC",
                (owner_user_id,),
            ).fetchall()
        return [self._row_to_room(dict(row)) for row in rows]

    def get_for_owner(self, room_id: str, owner_user_id: str) -> dict[str, Any] | None:
        with self.connection() as conn:
            row = conn.execute(
                "SELECT * FROM project_rooms WHERE room_id = ? AND owner_user_id = ?",
                (room_id, owner_user_id),
            ).fetchone()
        return self._row_to_room(dict(row)) if row else None

    # ----------------------------------------------------------------- mutate
    def append_message(
        self,
        room_id: str,
        owner_user_id: str,
        message: dict[str, Any],
        *,
        status: str | None = None,
    ) -> dict[str, Any] | None:
        room = self.get_for_owner(room_id, owner_user_id)
        if room is None:
            return None
        messages = list(room["messages"])
        messages.append(self._normalize_message(message))
        changes: dict[str, Any] = {"messages_json": self._dumps(messages)}
        if status is not None:
            changes["status"] = status
        return self._save(room_id, owner_user_id, changes)

    def set_spec(
        self,
        room_id: str,
        owner_user_id: str,
        spec: dict[str, Any],
        *,
        confidence: float,
        degraded: bool,
        status: str | None = None,
    ) -> dict[str, Any] | None:
        changes: dict[str, Any] = {
            "spec_json": self._dumps(redact_value(spec)),
            "confidence": float(confidence),
            "degraded": bool(degraded),
        }
        if status is not None:
            changes["status"] = status
        return self._save(room_id, owner_user_id, changes)

    def add_prompt_master_version(
        self,
        room_id: str,
        owner_user_id: str,
        version: dict[str, Any],
        *,
        status: str | None = None,
    ) -> dict[str, Any] | None:
        room = self.get_for_owner(room_id, owner_user_id)
        if room is None:
            return None
        versions = list(room["prompt_master_versions"])
        versions.append(version)
        changes: dict[str, Any] = {
            "prompt_master_md": version.get("markdown"),
            "prompt_master_versions_json": self._dumps(versions),
        }
        if status is not None:
            changes["status"] = status
        return self._save(room_id, owner_user_id, changes)

    def set_blueprint(
        self,
        room_id: str,
        owner_user_id: str,
        blueprint: dict[str, Any],
        *,
        status: str | None = None,
    ) -> dict[str, Any] | None:
        changes: dict[str, Any] = {"architecture_blueprint_json": self._dumps(blueprint)}
        if status is not None:
            changes["status"] = status
        return self._save(room_id, owner_user_id, changes)

    def add_blueprint_version(
        self,
        room_id: str,
        owner_user_id: str,
        version: dict[str, Any],
        *,
        status: str = "BLUEPRINT_READY",
    ) -> dict[str, Any] | None:
        room = self.get_for_owner(room_id, owner_user_id)
        if room is None:
            return None
        versions = list(room.get("blueprint_versions") or [])
        versions.append(version)
        return self._save(room_id, owner_user_id, {
            "architecture_blueprint_json": self._dumps(version["blueprint"]),
            "blueprint_versions_json": self._dumps(versions),
            "active_blueprint_version": version["version"],
            "degraded": bool(version["blueprint"].get("degraded")),
            "status": status,
        })

    def replace_blueprint_versions(
        self,
        room_id: str,
        owner_user_id: str,
        versions: list[dict[str, Any]],
        active_version: int,
        blueprint: dict[str, Any],
    ) -> dict[str, Any] | None:
        return self._save(room_id, owner_user_id, {
            "blueprint_versions_json": self._dumps(versions),
            "active_blueprint_version": active_version,
            "architecture_blueprint_json": self._dumps(blueprint),
            "degraded": bool(blueprint.get("degraded")),
        })

    def update_status(self, room_id: str, owner_user_id: str, status: str) -> dict[str, Any] | None:
        return self._save(room_id, owner_user_id, {"status": status})

    def save_handoff(
        self,
        room_id: str,
        owner_user_id: str,
        handoff: dict[str, Any],
        *,
        status: str | None = None,
    ) -> dict[str, Any] | None:
        changes: dict[str, Any] = {"generation_handoff_json": self._dumps(redact_value(handoff))}
        if status is not None:
            changes["status"] = status
        return self._save(room_id, owner_user_id, changes)


    def append_history(
        self,
        room_id: str,
        owner_user_id: str,
        event: dict[str, Any],
    ) -> dict[str, Any] | None:
        room = self.get_for_owner(room_id, owner_user_id)
        if room is None:
            return None
        history = list(room.get("history") or [])
        history.append(event)
        return self._save(room_id, owner_user_id, {"history_json": self._dumps(history)})

    def append_operation(
        self,
        room_id: str,
        owner_user_id: str,
        entry: dict[str, Any],
    ) -> dict[str, Any] | None:
        room = self.get_for_owner(room_id, owner_user_id)
        if room is None:
            return None
        log = list(room.get("operational_log") or [])
        log.append(entry)
        return self._save(room_id, owner_user_id, {"operational_log_json": self._dumps(log[-100:])})

    def set_last_failure(
        self,
        room_id: str,
        owner_user_id: str,
        failure: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        return self._save(
            room_id,
            owner_user_id,
            {"last_failure_json": self._dumps(failure) if failure else None},
        )

    def delete_for_owner(self, room_id: str, owner_user_id: str) -> bool:
        with self.connection() as conn:
            result = conn.execute(
                "DELETE FROM project_rooms WHERE room_id = ? AND owner_user_id = ?",
                (room_id, owner_user_id),
            )
        return result.rowcount > 0

    # --------------------------------------------------------------- internal
    def _save(self, room_id: str, owner_user_id: str, changes: dict[str, Any]) -> dict[str, Any] | None:
        changes = {key: value for key, value in changes.items() if key in MUTABLE_COLUMNS}
        changes["updated_at"] = self._now()
        assignments = ", ".join(f"{column} = :{column}" for column in changes)
        params = {**changes, "room_id": room_id, "owner_user_id": owner_user_id}
        with self.connection() as conn:
            result = conn.execute(
                f"UPDATE project_rooms SET {assignments} WHERE room_id = :room_id AND owner_user_id = :owner_user_id",
                params,
            )
            if result.rowcount == 0:
                return None
        return self.get_for_owner(room_id, owner_user_id)

    def _normalize_message(self, message: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": message.get("id") or f"msg_{uuid4().hex[:10]}",
            "role": message.get("role", "user"),
            "content": redact_text(str(message.get("content", ""))),
            "degraded": bool(message.get("degraded", False)),
            "created_at": message.get("created_at") or self._now(),
        }

    def _row_to_room(self, row: dict[str, Any]) -> dict[str, Any]:
        return {
            "room_id": row["room_id"],
            "owner_user_id": row["owner_user_id"],
            "workspace_id": row.get("workspace_id"),
            "title": row["title"],
            "status": row["status"],
            "delivery_type": row.get("delivery_type") or "web",
            "preferred_language": row.get("preferred_language") or "",
            "raw_intent": row.get("raw_intent") or "",
            "locale": row["locale"],
            "confidence": float(row.get("confidence") or 0.0),
            "degraded": bool(row.get("degraded")),
            "spec": self._loads(row.get("spec_json")) or None,
            "messages": self._loads(row.get("messages_json")) or [],
            "prompt_master_md": row.get("prompt_master_md"),
            "prompt_master_versions": self._loads(row.get("prompt_master_versions_json")) or [],
            "architecture_blueprint": self._loads(row.get("architecture_blueprint_json")) or None,
            "blueprint_versions": self._loads(row.get("blueprint_versions_json")) or [],
            "active_blueprint_version": row.get("active_blueprint_version"),
            "generation_handoff": self._loads(row.get("generation_handoff_json")) or None,
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
        return json.dumps(value, ensure_ascii=False)

    @staticmethod
    def _loads(value: str | None) -> Any:
        if not value:
            return None
        return json.loads(value)
