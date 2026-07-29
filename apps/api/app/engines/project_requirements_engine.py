from __future__ import annotations

from copy import deepcopy
from typing import Any


REQUIRED_LIST_FIELDS = ("target_users", "business_rules", "entities", "workflows", "constraints")
DELIVERY_TARGETS = {"zip", "github", "gitlab", "both"}


def normalize_project_requirements(requirements: dict[str, Any] | None) -> dict[str, Any]:
    normalized = deepcopy(requirements or {})
    normalized["project_goal"] = str(normalized.get("project_goal") or "").strip()
    normalized["business_context"] = str(normalized.get("business_context") or "").strip()
    for field in REQUIRED_LIST_FIELDS:
        values = normalized.get(field) or []
        normalized[field] = list(dict.fromkeys(str(item).strip() for item in values if str(item).strip()))
    delivery_target = str(normalized.get("delivery_target") or "").strip()
    normalized["delivery_target"] = delivery_target if delivery_target in DELIVERY_TARGETS else None
    return normalized


def requirements_missing_fields(
    requirements: dict[str, Any] | None,
    *,
    require_constraints: bool = True,
) -> list[str]:
    normalized = normalize_project_requirements(requirements)
    missing = [
        field
        for field in ("project_goal", "business_context", "target_users", "business_rules", "entities", "workflows")
        if not normalized[field]
    ]
    if require_constraints and not normalized["constraints"]:
        missing.append("constraints")
    if normalized["delivery_target"] not in DELIVERY_TARGETS:
        missing.append("delivery_target")
    return missing


def requirements_complete(requirements: dict[str, Any] | None) -> bool:
    return not requirements_missing_fields(requirements)
