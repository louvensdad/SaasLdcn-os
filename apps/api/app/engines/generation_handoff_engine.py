from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.data.foundation import CONTRACT_VERSION
from app.engines.dependency_graph_engine import calculate_impact
from app.engines.engineering_readiness_engine import calculate_engineering_readiness
from app.services.infrastructure_registry_service import InfrastructureRegistryService

SENSITIVE_KEY_PATTERN = re.compile(r"(secret|token|password|api[_-]?key|private[_-]?key|credential)", re.IGNORECASE)


def build_generation_handoff_package(project: dict[str, Any]) -> dict[str, Any]:
    blueprint = project.get("blueprint_snapshot") or None
    prompt_master = project.get("prompt_master_snapshot") or None
    gatekeeper = project.get("gatekeeper_snapshot") or None
    graph = project.get("architectural_graph_snapshot") or None
    selected = {
        "endpoints": _strings(project.get("selected_endpoints")),
        "modules": _strings(project.get("selected_business_modules")),
        "capabilities": _strings(project.get("selected_capabilities")),
    }
    selection = _selection(project, blueprint)

    infrastructure_recommendations = _safe_build(lambda: InfrastructureRegistryService().get_recommendations(selection))
    dependency_impact = _safe_build(lambda: calculate_impact(selection))
    engineering_readiness = _safe_build(lambda: calculate_engineering_readiness(selection))

    blockers = _collect_blockers(gatekeeper, dependency_impact, engineering_readiness)
    warnings = _collect_warnings(blueprint, prompt_master, gatekeeper, infrastructure_recommendations, dependency_impact, engineering_readiness)
    checklist = _build_checklist(
        project=project,
        blueprint=blueprint,
        prompt_master=prompt_master,
        gatekeeper=gatekeeper,
        graph=graph,
        selected=selected,
        infrastructure_recommendations=infrastructure_recommendations,
        engineering_readiness=engineering_readiness,
        blockers=blockers,
    )
    artifacts = _build_artifacts(
        project=project,
        blueprint=blueprint,
        prompt_master=prompt_master,
        gatekeeper=gatekeeper,
        graph=graph,
        selected=selected,
        infrastructure_recommendations=infrastructure_recommendations,
        dependency_impact=dependency_impact,
        engineering_readiness=engineering_readiness,
    )
    readiness = _resolve_readiness(project, blueprint, prompt_master, gatekeeper, graph, checklist)
    included_artifact_ids = [artifact["id"] for artifact in artifacts if artifact["included"]]

    return _sanitize(
        {
            "contractVersion": CONTRACT_VERSION,
            "handoff_id": f"handoff_{uuid4().hex[:12]}",
            "project_id": project["project_id"],
            "project_name": project["project_name"],
            "handoff_readiness": readiness,
            "project_record": project,
            "blueprint_snapshot": blueprint,
            "prompt_master_snapshot": prompt_master,
            "gatekeeper_snapshot": gatekeeper,
            "architectural_graph_snapshot": graph,
            "infrastructure_recommendations": infrastructure_recommendations,
            "dependency_impact": dependency_impact,
            "engineering_readiness": engineering_readiness,
            "selected": selected,
            "checklist": checklist,
            "artifacts": artifacts,
            "blockers": blockers,
            "warnings": warnings,
            "trace": {
                "contractVersion": CONTRACT_VERSION,
                "generated_at": datetime.now(UTC).replace(microsecond=0).isoformat(),
                "project_id": project["project_id"],
                "operations": [
                    "read_project_record",
                    "compose_generation_handoff_package",
                    "evaluate_readiness_checklist",
                ],
                "included_artifact_ids": included_artifact_ids,
                "omitted_sensitive_fields": ["secret", "token", "password", "api_key", "private_key", "credential"],
                "contains_secrets": False,
            },
            "generation_disabled": True,
            "metadata": {
                "no_code_generation": True,
                "no_ai_calls": True,
                "no_agent_execution": True,
                "no_project_files_created": True,
            },
        }
    )


def _selection(project: dict[str, Any], blueprint: dict[str, Any] | None) -> dict[str, Any]:
    technology = project.get("technology_graph") or {}
    infrastructure_profile = (blueprint or {}).get("infrastructure_profile") or {}
    return {
        "language_id": ((technology.get("language") or {}).get("id") or "").strip(),
        "runtime_id": ((technology.get("runtime") or {}).get("id") or "").strip(),
        "framework_id": ((technology.get("framework") or {}).get("id") or "").strip(),
        "architecture_id": project.get("architecture_id") or ((technology.get("architecture") or {}).get("id") or ""),
        "archetype_id": project.get("archetype_id") or "",
        "architecture_level": infrastructure_profile.get("architecture_level") or project.get("architecture_id") or "",
        "capability_ids": _strings(project.get("selected_capabilities")),
        "infrastructure_ids": _strings(infrastructure_profile.get("selected_component_ids")),
        "selected_component_ids": _strings(infrastructure_profile.get("selected_component_ids")),
    }


def _build_checklist(
    *,
    project: dict[str, Any],
    blueprint: dict[str, Any] | None,
    prompt_master: dict[str, Any] | None,
    gatekeeper: dict[str, Any] | None,
    graph: dict[str, Any] | None,
    selected: dict[str, list[str]],
    infrastructure_recommendations: dict[str, Any] | None,
    engineering_readiness: dict[str, Any] | None,
    blockers: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    gatekeeper_decision = (gatekeeper or {}).get("decision")
    return [
        _check("blueprint_exists", "Blueprint exists", bool(blueprint), "Blueprint snapshot is attached to the project."),
        _check("prompt_master_exists", "Prompt Master exists", bool(prompt_master), "Prompt Master snapshot is attached to the project."),
        _check(
            "gatekeeper_approved",
            "Gatekeeper approved or approved with warnings",
            gatekeeper_decision in {"approved", "approved_with_warnings"},
            f"Gatekeeper decision is {gatekeeper_decision or 'missing'}.",
        ),
        _check("architectural_graph_exists", "Architectural graph exists", bool(graph), "Architectural graph snapshot is attached to the project."),
        _check("endpoints_selected", "Endpoints selected", bool(selected["endpoints"]), f"{len(selected['endpoints'])} endpoints selected."),
        _check("modules_selected", "Modules selected", bool(selected["modules"]), f"{len(selected['modules'])} modules selected."),
        _check(
            "infrastructure_recommendations_available",
            "Infrastructure recommendations available",
            infrastructure_recommendations is not None,
            "Infrastructure recommendation profile was resolved deterministically.",
        ),
        _check(
            "engineering_readiness_available",
            "Engineering readiness available",
            engineering_readiness is not None,
            "Engineering readiness profile was resolved deterministically.",
        ),
        _check("no_critical_blockers", "No critical blockers", len(blockers) == 0, f"{len(blockers)} critical blockers detected."),
        _check(
            "project_status_ready_for_generation",
            "Project status ready_for_generation",
            project.get("status") == "ready_for_generation",
            f"Project status is {project.get('status')}.",
        ),
    ]


def _build_artifacts(
    *,
    project: dict[str, Any],
    blueprint: dict[str, Any] | None,
    prompt_master: dict[str, Any] | None,
    gatekeeper: dict[str, Any] | None,
    graph: dict[str, Any] | None,
    selected: dict[str, list[str]],
    infrastructure_recommendations: dict[str, Any] | None,
    dependency_impact: dict[str, Any] | None,
    engineering_readiness: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    return [
        _artifact("project_record", "project_record", "ProjectRecord", True, "project_registry", project.get("project_name", "Project record")),
        _artifact("blueprint_snapshot", "blueprint_snapshot", "Blueprint snapshot", bool(blueprint), "project_registry", "Saved blueprint contract"),
        _artifact("prompt_master_snapshot", "prompt_master_snapshot", "Prompt Master snapshot", bool(prompt_master), "project_registry", "Saved Prompt Master contract", len((prompt_master or {}).get("sections") or [])),
        _artifact("gatekeeper_snapshot", "gatekeeper_snapshot", "Gatekeeper snapshot", bool(gatekeeper), "project_registry", "Saved Gatekeeper decision", len((gatekeeper or {}).get("checks") or [])),
        _artifact("architectural_graph_snapshot", "architectural_graph_snapshot", "Architectural Graph snapshot", bool(graph), "project_registry", "Saved graph snapshot", len(((graph or {}).get("graph") or {}).get("nodes") or [])),
        _artifact("infrastructure_recommendations", "infrastructure_recommendations", "Infrastructure recommendations", infrastructure_recommendations is not None, "infrastructure_registry", "Deterministic infrastructure recommendation profile"),
        _artifact("dependency_impact", "dependency_impact", "Dependency impact", dependency_impact is not None, "dependency_graph_engine", "Deterministic dependency impact profile"),
        _artifact("engineering_readiness", "engineering_readiness", "Engineering readiness", engineering_readiness is not None, "engineering_readiness_engine", "Deterministic engineering readiness profile"),
        _artifact("selected_scope", "selected_scope", "Selected endpoints/modules/capabilities", True, "project_record", "Selected project scope", len(selected["endpoints"]) + len(selected["modules"]) + len(selected["capabilities"])),
    ]


def _resolve_readiness(
    project: dict[str, Any],
    blueprint: dict[str, Any] | None,
    prompt_master: dict[str, Any] | None,
    gatekeeper: dict[str, Any] | None,
    graph: dict[str, Any] | None,
    checklist: list[dict[str, Any]],
) -> str:
    if (gatekeeper or {}).get("decision") == "blocked" or project.get("status") == "generation_blocked":
        return "blocked"
    if not all([blueprint, prompt_master, gatekeeper, graph]):
        return "incomplete"
    required_failed = [item for item in checklist if item["required"] and item["status"] == "failed"]
    return "ready" if not required_failed else "incomplete"


def _collect_blockers(
    gatekeeper: dict[str, Any] | None,
    dependency_impact: dict[str, Any] | None,
    engineering_readiness: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    blockers: list[dict[str, Any]] = []
    for index, blocker in enumerate((gatekeeper or {}).get("blockers") or []):
        blockers.append(_blocker(f"gatekeeper_blocker_{index}", "gatekeeper", _message(blocker), _related(blocker)))
    if (dependency_impact or {}).get("security_surface") == "hyperscale":
        blockers.append(_blocker("dependency_security_surface", "dependency_impact", "Dependency impact reports a hyperscale security surface.", []))
    for risk in (engineering_readiness or {}).get("engineering_risks") or []:
        if risk.get("severity") == "critical":
            blockers.append(_blocker(risk.get("id") or "engineering_critical_risk", "engineering_readiness", risk.get("summary") or risk.get("title") or "Critical engineering risk.", _strings(risk.get("related_ids"))))
    return blockers


def _collect_warnings(
    blueprint: dict[str, Any] | None,
    prompt_master: dict[str, Any] | None,
    gatekeeper: dict[str, Any] | None,
    infrastructure_recommendations: dict[str, Any] | None,
    dependency_impact: dict[str, Any] | None,
    engineering_readiness: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    warnings: list[dict[str, Any]] = []
    for source, items in [
        ("blueprint", ((blueprint or {}).get("validation") or {}).get("warnings") or []),
        ("prompt_master", ((prompt_master or {}).get("validation") or {}).get("warnings") or []),
        ("gatekeeper", (gatekeeper or {}).get("warnings") or []),
    ]:
        for index, item in enumerate(items):
            warnings.append(_warning(f"{source}_warning_{index}", source, _message(item), _related(item)))
    for index, message in enumerate((infrastructure_recommendations or {}).get("warnings") or []):
        warnings.append(_warning(f"infrastructure_warning_{index}", "infrastructure_recommendations", str(message), []))
    for field in ("infra_complexity", "deployment_complexity", "operational_burden", "maintenance_cost"):
        if (dependency_impact or {}).get(field) in {"enterprise", "hyperscale"}:
            warnings.append(_warning(f"dependency_{field}", "dependency_impact", f"Dependency impact reports {field.replace('_', ' ')} as {(dependency_impact or {}).get(field)}.", []))
    for risk in (engineering_readiness or {}).get("engineering_risks") or []:
        if risk.get("severity") in {"warning", "info"}:
            warnings.append(_warning(risk.get("id") or "engineering_risk", "engineering_readiness", risk.get("summary") or risk.get("title") or "Engineering readiness risk.", _strings(risk.get("related_ids")), risk.get("severity") or "warning"))
    return warnings


def _check(check_id: str, label: str, passed: bool, summary: str) -> dict[str, Any]:
    return {
        "contractVersion": CONTRACT_VERSION,
        "id": check_id,
        "label": label,
        "required": True,
        "status": "passed" if passed else "failed",
        "summary": summary,
    }


def _artifact(artifact_id: str, kind: str, label: str, included: bool, source: str, summary: str, item_count: int | None = None) -> dict[str, Any]:
    artifact = {
        "contractVersion": CONTRACT_VERSION,
        "id": artifact_id,
        "kind": kind,
        "label": label,
        "included": included,
        "source": source,
        "summary": summary,
    }
    if item_count is not None:
        artifact["item_count"] = item_count
    return artifact


def _blocker(code: str, source: str, message: str, related_ids: list[str]) -> dict[str, Any]:
    return {"contractVersion": CONTRACT_VERSION, "code": code, "source": source, "message": message, "severity": "critical", "related_ids": related_ids}


def _warning(code: str, source: str, message: str, related_ids: list[str], severity: str = "warning") -> dict[str, Any]:
    return {"contractVersion": CONTRACT_VERSION, "code": code, "source": source, "message": message, "severity": severity if severity in {"warning", "info"} else "warning", "related_ids": related_ids}


def _safe_build(factory):
    try:
        return factory()
    except Exception:
        return None


def _message(item: Any) -> str:
    if isinstance(item, dict):
        return str(item.get("message") or item.get("summary") or item.get("title") or item.get("code") or "Readiness issue detected.")
    return str(item)


def _related(item: Any) -> list[str]:
    if not isinstance(item, dict):
        return []
    return _strings(item.get("related_ids") or item.get("related_node_ids") or [])


def _strings(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    return list(dict.fromkeys(str(item).strip() for item in values if str(item).strip()))


def _sanitize(value: Any) -> Any:
    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
        for key, item in value.items():
            if SENSITIVE_KEY_PATTERN.search(str(key)) and str(key) != "contains_secrets":
                sanitized[key] = "[REDACTED]"
            else:
                sanitized[key] = _sanitize(item)
        return sanitized
    if isinstance(value, list):
        return [_sanitize(item) for item in value]
    return value
