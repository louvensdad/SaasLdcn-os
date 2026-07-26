from __future__ import annotations

import hashlib
import json
from typing import Any

from app.schemas.orchestrator import ProjectSpec, SuggestedStack

REQUIRED_ARTIFACT_TYPES_SOFTWARE_BUILD: tuple[str, ...] = (
    "blueprint",
    "prompt_md",
    "architecture",
    "data_model",
    "api_contracts",
    "test_plan",
    "deploy_plan",
)


def _answer(answers: dict[str, Any], step_id: str, field_id: str) -> Any:
    return answers.get(f"{step_id}.{field_id}")


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _as_string_list(value: Any) -> list[str]:
    """Best-effort coercion for chip/multiselect/entity-editor answer values,
    whose stored JSON shape varies by field type -- never re-asks an LLM to
    reinterpret the mission, just normalizes whatever structured value the
    Mission Workspace already captured."""
    if value is None:
        return []
    if isinstance(value, str):
        return [line.strip() for line in value.splitlines() if line.strip()]
    if isinstance(value, list):
        items: list[str] = []
        for entry in value:
            if isinstance(entry, str):
                if entry.strip():
                    items.append(entry.strip())
            elif isinstance(entry, dict):
                label = entry.get("name") or entry.get("title") or entry.get("label") or entry.get("id")
                if label:
                    items.append(str(label).strip())
            elif entry is not None:
                items.append(str(entry).strip())
        return items
    return [str(value).strip()]


def build_project_spec_from_mission_software_build(mission: dict[str, Any]) -> tuple[ProjectSpec, str]:
    """Pure mapping from a software.build Mission's own confirmed answers into
    a real ProjectSpec -- never sends raw_intent back to an LLM to
    reinterpret, since the structured answers already ARE the interpreted
    intent (this Mission's whole point)."""
    answers = (mission.get("context") or {}).get("answers") or {}

    project_name = _as_text(_answer(answers, "vision", "project_name")) or mission.get("title") or "Projeto sem nome"
    system_type = _as_text(_answer(answers, "vision", "system_type"))
    vision_description = _as_text(_answer(answers, "vision", "vision_description"))
    problem = _as_text(_answer(answers, "vision", "problem"))
    raw_intent = "\n\n".join(part for part in (vision_description, problem) if part) or project_name

    spec = ProjectSpec(
        raw_intent=raw_intent,
        product_summary=vision_description or problem,
        system_type=system_type,
        target_users=_as_string_list(_answer(answers, "users", "user_types")),
        business_rules=_as_string_list(_answer(answers, "business_rules", "main_rules")),
        entities=_as_string_list(_answer(answers, "data_model", "entities")),
        core_workflows=_as_string_list(_answer(answers, "business_rules", "operational_flows")),
        suggested_stack=SuggestedStack(
            language=_as_text(_answer(answers, "technology", "language")),
            framework=_as_text(_answer(answers, "technology", "framework")),
            architecture=_as_text(_answer(answers, "architecture", "architecture_style")),
        ),
        confidence=1.0,  # real, confirmed human input -- not an AI guess
    )
    return spec, project_name


def build_generation_input_manifest(
    mission: dict[str, Any], deliverable_job_id: str, *, required_types: tuple[str, ...]
) -> dict[str, Any]:
    """Validates every required deliverable type is present with non-empty
    content before anything is built from it. Raises ValueError (the caller
    maps this to 422) listing exactly what's missing -- never proceeds with
    partial data."""
    artifacts_by_type: dict[str, dict[str, Any]] = {}
    for artifact in mission.get("artifacts") or []:
        artifact_type = artifact.get("type")
        if artifact_type and artifact_type not in artifacts_by_type:
            artifacts_by_type[artifact_type] = artifact

    missing: list[str] = []
    manifest_artifacts: list[dict[str, Any]] = []
    for artifact_type in required_types:
        artifact = artifacts_by_type.get(artifact_type)
        content = _as_text(artifact.get("content")) if artifact else ""
        if not artifact or not content:
            missing.append(artifact_type)
            continue
        manifest_artifacts.append({
            "type": artifact_type,
            "version": artifact.get("generated_at"),
            "checksum": hashlib.sha256(content.encode("utf-8")).hexdigest(),
        })

    if missing:
        raise ValueError(
            "Entregáveis ausentes ou vazios: " + ", ".join(missing) +
            ". Gere e confirme todos os entregáveis da missão antes de preparar o projeto."
        )

    return {
        "missionId": mission["id"],
        "deliverableJobId": deliverable_job_id,
        "artifacts": manifest_artifacts,
        "validated": True,
        "missingTypes": [],
    }


def compute_input_checksum(manifest: dict[str, Any], deliverable_job_id: str) -> str:
    """Change-detection key for MissionExecutionHandoffService: identical
    checksum means the mission's confirmed artifacts haven't changed since the
    last prepare_project call, so it's a no-op instead of a new room/version."""
    payload = json.dumps(
        {"deliverableJobId": deliverable_job_id, "artifacts": manifest.get("artifacts", [])},
        sort_keys=True, ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
