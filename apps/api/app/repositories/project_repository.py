from __future__ import annotations

import json
import re
from collections.abc import Sequence
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.core.config import get_settings
from app.core.database import connection as database_connection, database_url_for
from app.data.foundation import CONTRACT_VERSION, PROJECT_SEED
from app.engines.architectural_graph_engine import generate_graph_snapshot


SENSITIVE_KEY_PATTERN = re.compile(r"(secret|token|password|api[_-]?key|private[_-]?key|credential)", re.IGNORECASE)
SENSITIVE_VALUE_PATTERN = re.compile(r"(secret|token|password|api[_-]?key|private[_-]?key)\s*[:=]\s*\S+", re.IGNORECASE)
SAFE_BOOLEAN_TRACE_KEYS = {"contains_secrets"}


class ProjectRepository:
    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self.sqlite_path = database if isinstance(database, Path) else get_settings().sqlite_path

    def connection(self):
        return database_connection(self.database_url)

    def initialize(self) -> None:
        """Seed reference projects after Alembic has created the schema."""
        with self.connection() as conn:
            project_count = conn.execute("SELECT COUNT(*) FROM projects").fetchone()[0]
            if project_count == 0:
                for project in PROJECT_SEED:
                    seed_project = {**project, "project_key": project.get("project_key", project["project_id"])}
                    conn.execute(
                        """
                        INSERT INTO projects (
                            project_id, project_key, project_name, status, locale, generation_mode,
                            technology_graph_json, architecture_id, archetype_id,
                            selected_capabilities_json, selected_business_modules_json, selected_endpoints_json,
                            blueprint_snapshot_json, prompt_master_snapshot_json, gatekeeper_snapshot_json,
                            readiness_status, contract_version, created_at, updated_at
                        ) VALUES (
                            :project_id, :project_key, :project_name, :status, :locale, :generation_mode,
                            :technology_graph_json, :architecture_id, :archetype_id,
                            :selected_capabilities_json, :selected_business_modules_json, :selected_endpoints_json,
                            :blueprint_snapshot_json, :prompt_master_snapshot_json, :gatekeeper_snapshot_json,
                            :readiness_status, :contract_version, :created_at, :updated_at
                        )
                        """,
                        seed_project,
                    )
    def list_projects(self) -> Sequence[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute(
                """
                SELECT
                    COALESCE(project_id, project_key) AS project_id,
                    project_key, project_name, status, locale, generation_mode,
                    technology_graph_json, architecture_id, archetype_id,
                    selected_capabilities_json, selected_business_modules_json, selected_endpoints_json,
                    blueprint_snapshot_json, architectural_graph_snapshot_json, prompt_master_snapshot_json, gatekeeper_snapshot_json,
                    readiness_status, contract_version, generated_project_path, created_at, updated_at
                FROM projects
                WHERE status != 'draft'
                ORDER BY created_at DESC
                """
            ).fetchall()
        return [self._row_to_project(dict(row)) for row in rows]

    def get_project(self, project_id: str) -> dict[str, Any] | None:
        with self.connection() as conn:
            row = conn.execute(
                """
                SELECT
                    COALESCE(project_id, project_key) AS project_id,
                    project_key, project_name, status, locale, generation_mode,
                    technology_graph_json, architecture_id, archetype_id,
                    selected_capabilities_json, selected_business_modules_json, selected_endpoints_json,
                    blueprint_snapshot_json, architectural_graph_snapshot_json, prompt_master_snapshot_json, gatekeeper_snapshot_json,
                    readiness_status, contract_version, generated_project_path, created_at, updated_at
                FROM projects
                WHERE (project_id = ? OR project_key = ?) AND status != 'draft'
                """,
                (project_id, project_id),
            ).fetchone()
        return self._row_to_project(dict(row)) if row else None

    def get_project_by_blueprint_id(self, blueprint_id: str) -> dict[str, Any] | None:
        # JSON extraction differs between SQLite and PostgreSQL. Keep the snapshot
        # portable by decoding candidate rows in Python until this column becomes
        # a native JSONB field in a dedicated migration.
        for project in self.list_projects():
            if project.get("blueprint_snapshot", {}).get("blueprint_id") == blueprint_id:
                return project
        return None
    def save_from_wizard(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        blueprint = self._sanitize_snapshot(payload["blueprint"])
        prompt_master = self._sanitize_snapshot(payload["prompt_master"])
        gatekeeper = self._sanitize_snapshot(payload["gatekeeper"])

        gatekeeper_decision = gatekeeper["decision"]
        status = "generation_blocked" if gatekeeper_decision == "blocked" else "ready_for_generation"
        readiness_status = {
            "blocked": "blocked",
            "approved": "ready",
            "approved_with_warnings": "ready_with_warnings",
        }[gatekeeper_decision]
        graph_selection = {
            "language_id": blueprint["technology_graph"]["language"]["id"],
            "framework_id": blueprint["technology_graph"]["framework"]["id"],
            "architecture_id": blueprint["architecture_profile"]["architecture_id"],
            "capability_ids": [item["id"] for item in blueprint["capabilities"]],
            "business_module_ids": [item["id"] for item in blueprint["business_modules"]],
            "infrastructure_ids": blueprint.get("infrastructure_profile", {}).get("selected_component_ids", []),
        }
        architectural_graph_snapshot = self._sanitize_snapshot(generate_graph_snapshot(graph_selection))

        with self.connection() as conn:
            project_id = self._generate_project_id(conn)

        record = {
            "project_id": project_id,
            "project_key": project_id,
            "project_name": blueprint["project_name"],
            "description": f"Persisted registry snapshot for {blueprint['project_name']}.",
            "objective": "Save a validated wizard selection without code generation or IA.",
            "stack_id": blueprint["technology_graph"]["framework"]["id"],
            "project_locale": blueprint["locale"],
            "status": status,
            "scope": f"{len(blueprint['capabilities'])} capabilities, {len(blueprint['business_modules'])} modules, {len(blueprint['endpoints'])} endpoints.",
            "locale": blueprint["locale"],
            "generation_mode": blueprint["generation_mode"],
            "technology_graph_json": self._serialize_json(blueprint["technology_graph"]),
            "architecture_id": blueprint["architecture_profile"]["architecture_id"],
            "archetype_id": blueprint["archetype_profile"]["archetype_id"],
            "selected_capabilities_json": self._serialize_json([item["id"] for item in blueprint["capabilities"]]),
            "selected_business_modules_json": self._serialize_json([item["id"] for item in blueprint["business_modules"]]),
            "selected_endpoints_json": self._serialize_json([item["id"] for item in blueprint["endpoints"]]),
            "blueprint_snapshot_json": self._serialize_json(blueprint),
            "architectural_graph_snapshot_json": self._serialize_json(architectural_graph_snapshot),
            "prompt_master_snapshot_json": self._serialize_json(prompt_master),
            "gatekeeper_snapshot_json": self._serialize_json(gatekeeper),
            "tags_json": self._serialize_json([
                "wizard",
                "project_registry",
                blueprint["generation_mode"],
                gatekeeper_decision,
            ]),
            "readiness_status": readiness_status,
            "contract_version": CONTRACT_VERSION,
            "generated_project_path": None,
            "created_at": now,
            "updated_at": now,
        }
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO projects (
                    project_id, project_key, project_name, description, objective, stack_id, project_locale,
                    status, scope, locale, generation_mode,
                    technology_graph_json, architecture_id, archetype_id,
                    selected_capabilities_json, selected_business_modules_json, selected_endpoints_json,
                    blueprint_snapshot_json, architectural_graph_snapshot_json, prompt_master_snapshot_json, gatekeeper_snapshot_json, tags_json,
                    readiness_status, contract_version, generated_project_path, created_at, updated_at
                ) VALUES (
                    :project_id, :project_key, :project_name, :description, :objective, :stack_id, :project_locale,
                    :status, :scope, :locale, :generation_mode,
                    :technology_graph_json, :architecture_id, :archetype_id,
                    :selected_capabilities_json, :selected_business_modules_json, :selected_endpoints_json,
                    :blueprint_snapshot_json, :architectural_graph_snapshot_json, :prompt_master_snapshot_json, :gatekeeper_snapshot_json, :tags_json,
                    :readiness_status, :contract_version, :generated_project_path, :created_at, :updated_at
                )
                """,
                record,
            )
        return self._row_to_project(record)

    def update_project(self, project_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
        current = self.get_project(project_id)
        if current is None:
            return None

        updated = {
            **current,
            **{key: value for key, value in payload.items() if value is not None},
            "updated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        }
        record = {
            "project_id": updated["project_id"],
            "project_key": updated["project_id"],
            "project_name": updated["project_name"],
            "description": updated.get("description", f"Persisted registry snapshot for {updated['project_name']}."),
            "objective": updated.get("objective", "Save a validated wizard selection without code generation or IA."),
            "stack_id": updated.get("stack_id", updated["technology_graph"]["framework"]["id"]),
            "project_locale": updated.get("project_locale", updated["locale"]),
            "status": updated["status"],
            "scope": updated.get("scope", f"{len(updated['selected_capabilities'])} capabilities, {len(updated['selected_business_modules'])} modules, {len(updated['selected_endpoints'])} endpoints."),
            "locale": updated["locale"],
            "generation_mode": updated["generation_mode"],
            "technology_graph_json": self._serialize_json(updated["technology_graph"]),
            "architecture_id": updated["architecture_id"],
            "archetype_id": updated["archetype_id"],
            "selected_capabilities_json": self._serialize_json(updated["selected_capabilities"]),
            "selected_business_modules_json": self._serialize_json(updated["selected_business_modules"]),
            "selected_endpoints_json": self._serialize_json(updated["selected_endpoints"]),
            "blueprint_snapshot_json": self._serialize_json(updated["blueprint_snapshot"]),
            "architectural_graph_snapshot_json": self._serialize_json(updated.get("architectural_graph_snapshot")),
            "prompt_master_snapshot_json": self._serialize_json(updated["prompt_master_snapshot"]),
            "gatekeeper_snapshot_json": self._serialize_json(updated["gatekeeper_snapshot"]),
            "tags_json": updated.get(
                "tags_json",
                self._serialize_json(["wizard", "project_registry", updated["generation_mode"], updated["status"]]),
            ),
            "readiness_status": updated["readiness_status"],
            "contract_version": CONTRACT_VERSION,
            "generated_project_path": updated.get("generated_project_path"),
            "created_at": updated["created_at"],
            "updated_at": updated["updated_at"],
        }
        with self.connection() as conn:
            conn.execute(
                """
                UPDATE projects
                SET
                    project_id = :project_id,
                    project_key = :project_key,
                    project_name = :project_name,
                    description = :description,
                    objective = :objective,
                    stack_id = :stack_id,
                    project_locale = :project_locale,
                    status = :status,
                    scope = :scope,
                    locale = :locale,
                    generation_mode = :generation_mode,
                    technology_graph_json = :technology_graph_json,
                    architecture_id = :architecture_id,
                    archetype_id = :archetype_id,
                    selected_capabilities_json = :selected_capabilities_json,
                    selected_business_modules_json = :selected_business_modules_json,
                    selected_endpoints_json = :selected_endpoints_json,
                    blueprint_snapshot_json = :blueprint_snapshot_json,
                    architectural_graph_snapshot_json = :architectural_graph_snapshot_json,
                    prompt_master_snapshot_json = :prompt_master_snapshot_json,
                    gatekeeper_snapshot_json = :gatekeeper_snapshot_json,
                    tags_json = :tags_json,
                    readiness_status = :readiness_status,
                    contract_version = :contract_version,
                    generated_project_path = :generated_project_path,
                    created_at = :created_at,
                    updated_at = :updated_at
                WHERE project_id = :project_id OR project_key = :project_id
                """,
                record,
            )
        return self._row_to_project(record)

    def delete_project(self, project_id: str) -> bool:
        with self.connection() as conn:
            result = conn.execute("DELETE FROM projects WHERE project_id = ? OR project_key = ?", (project_id, project_id))
        return result.rowcount > 0

    def _generate_project_id(self, conn) -> str:
        while True:
            project_id = f"project_{uuid4().hex[:12]}"
            exists = conn.execute(
                "SELECT 1 FROM projects WHERE project_id = ? OR project_key = ?",
                (project_id, project_id),
            ).fetchone()
            if not exists:
                return project_id

    def _row_to_project(self, row: dict[str, Any]) -> dict[str, Any]:
        blueprint_snapshot = self._deserialize_json(row["blueprint_snapshot_json"]) or {}
        if isinstance(blueprint_snapshot, dict) and "infrastructure_profile" not in blueprint_snapshot:
            blueprint_snapshot["infrastructure_profile"] = {
                "architecture_level": row.get("architecture_id") or "unknown",
                "selected_component_ids": [],
                "recommended_component_ids": [],
                "required_component_ids": [],
                "optional_component_ids": [],
                "warnings": [],
                "rationale": [],
            }
        return {
            "contractVersion": row["contract_version"],
            "project_id": row["project_id"],
            "project_key": row["project_key"] if "project_key" in row.keys() else row["project_id"],
            "project_name": row["project_name"],
            "status": row["status"],
            "locale": row["locale"],
            "generation_mode": row["generation_mode"],
            "technology_graph": self._deserialize_json(row["technology_graph_json"]) or {},
            "architecture_id": row["architecture_id"],
            "archetype_id": row["archetype_id"],
            "selected_capabilities": self._deserialize_json(row["selected_capabilities_json"]) or [],
            "selected_business_modules": self._deserialize_json(row["selected_business_modules_json"]) or [],
            "selected_endpoints": self._deserialize_json(row["selected_endpoints_json"]) or [],
            "blueprint_snapshot": blueprint_snapshot,
            "architectural_graph_snapshot": self._deserialize_json(row["architectural_graph_snapshot_json"] if "architectural_graph_snapshot_json" in row.keys() else None),
            "prompt_master_snapshot": self._deserialize_json(row["prompt_master_snapshot_json"]) or {},
            "gatekeeper_snapshot": self._deserialize_json(row["gatekeeper_snapshot_json"]) or {},
            "readiness_status": row["readiness_status"] or "not_ready",
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "generated_project_path": row["generated_project_path"] if "generated_project_path" in row.keys() else None,
        }

    @staticmethod
    def _serialize_json(value: Any) -> str:
        return json.dumps(value, ensure_ascii=True, sort_keys=True)

    @staticmethod
    def _deserialize_json(value: str | None) -> Any:
        if not value:
            return None
        return json.loads(value)

    def _sanitize_snapshot(self, value: Any) -> Any:
        if isinstance(value, dict):
            sanitized: dict[str, Any] = {}
            for key, item in value.items():
                if str(key) in SAFE_BOOLEAN_TRACE_KEYS:
                    sanitized[key] = item
                elif SENSITIVE_KEY_PATTERN.search(str(key)):
                    sanitized[key] = "[REDACTED]"
                else:
                    sanitized[key] = self._sanitize_snapshot(item)
            return sanitized
        if isinstance(value, list):
            return [self._sanitize_snapshot(item) for item in value]
        if isinstance(value, str) and SENSITIVE_VALUE_PATTERN.search(value):
            return SENSITIVE_VALUE_PATTERN.sub("[REDACTED]", value)
        return value
