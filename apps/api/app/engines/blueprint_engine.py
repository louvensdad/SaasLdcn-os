from __future__ import annotations

from collections.abc import Sequence
from copy import deepcopy
from datetime import datetime, UTC
from typing import Any
from uuid import uuid4

from app.data.foundation import CONTRACT_VERSION, LOCALES
from app.engines.dependency_graph_engine import generate_dependency_snapshot
from app.engines.project_requirements_engine import normalize_project_requirements, requirements_missing_fields
from app.repositories.registry_repository import RegistryRepository
from app.services.infrastructure_registry_service import InfrastructureRegistryService
from app.services.localization_service import LocalizationService


ALLOWED_GENERATION_MODES = {
    "foundation_only",
    "template_assisted",
    "guided",
    "local_build_90",
}

COMPLEXITY_BANDS = ("low", "medium", "high", "enterprise", "hyperscale")

ARCHITECTURE_PATTERNS: dict[str, list[str]] = {
    "monolith": ["centralized deployment", "shared codebase", "layered modules"],
    "modular_monolith": ["domain modules", "internal boundaries", "shared deployable"],
    "clean_architecture": ["use-case boundaries", "dependency inversion", "infrastructure adapters"],
    "hexagonal": ["ports and adapters", "domain isolation", "testable boundaries"],
    "microservices": ["bounded services", "async messaging", "resilient integration contracts"],
    "event_driven": ["event contracts", "async processing", "eventual consistency"],
    "cqrs": ["segregated reads and writes", "governed domain flows", "operational tracing"],
    "distributed_system": ["service coordination", "operational governance", "decentralized execution"],
    "serverless": ["function boundaries", "managed scaling", "event triggers"],
}


def normalize_selection(selection: dict[str, Any]) -> dict[str, Any]:
    normalized = deepcopy(selection)
    normalized["project_name"] = str(normalized.get("project_name") or "").strip()
    normalized["locale"] = (normalized.get("locale") or "pt-BR").strip()
    normalized["generation_mode"] = (normalized.get("generation_mode") or "local_build_90").strip()

    for field in ("capability_ids", "business_module_ids", "endpoint_ids", "infrastructure_component_ids"):
        values = normalized.get(field) or []
        normalized[field] = list(dict.fromkeys(str(item).strip() for item in values if str(item).strip()))

    for field in ("language_id", "runtime_id", "framework_id", "architecture_id", "archetype_id"):
        normalized[field] = str(normalized.get(field) or "").strip()

    normalized["project_requirements"] = normalize_project_requirements(normalized.get("project_requirements"))
    return normalized


def resolve_profiles(selection: dict[str, Any], repository: RegistryRepository | None = None) -> dict[str, Any]:
    repo = repository or RegistryRepository()

    languages = {item["id"]: item for item in repo.list_languages()}
    runtimes = {item["id"]: item for item in repo.list_runtimes()}
    frameworks = {item["id"]: item for item in repo.list_frameworks()}
    architectures = {item["id"]: item for item in repo.list_architectures()}
    archetypes = {item["id"]: item for item in repo.list_archetypes()}
    capabilities = {item["id"]: item for item in repo.list_capabilities()}
    modules = {item["id"]: item for item in repo.list_business_modules()}
    endpoints = {item["id"]: item for item in repo.list_endpoints()}
    locales = {item["code"]: item for item in LOCALES}

    def resolve_many(ids: Sequence[str], source: dict[str, dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
        found: list[dict[str, Any]] = []
        missing: list[str] = []
        for item_id in ids:
            item = source.get(item_id)
            if item is None:
                missing.append(item_id)
            else:
                found.append(item)
        return found, missing

    selected_capabilities, missing_capabilities = resolve_many(selection["capability_ids"], capabilities)
    selected_modules, missing_modules = resolve_many(selection["business_module_ids"], modules)
    selected_endpoints, missing_endpoints = resolve_many(selection["endpoint_ids"], endpoints)

    return {
        "language": languages.get(selection["language_id"]),
        "runtime": runtimes.get(selection["runtime_id"]),
        "framework": frameworks.get(selection["framework_id"]),
        "architecture": architectures.get(selection["architecture_id"]),
        "archetype": archetypes.get(selection["archetype_id"]),
        "capabilities": selected_capabilities,
        "business_modules": selected_modules,
        "endpoints": selected_endpoints,
        "locale": locales.get(selection["locale"]),
        "lookups": {
            "languages": languages,
            "runtimes": runtimes,
            "frameworks": frameworks,
            "architectures": architectures,
            "archetypes": archetypes,
            "capabilities": capabilities,
            "business_modules": modules,
            "endpoints": endpoints,
            "locales": locales,
        },
        "missing": {
            "capability_ids": missing_capabilities,
            "business_module_ids": missing_modules,
            "endpoint_ids": missing_endpoints,
            "language_id": [] if languages.get(selection["language_id"]) else [selection["language_id"]],
            "runtime_id": [] if runtimes.get(selection["runtime_id"]) else [selection["runtime_id"]],
            "framework_id": [] if frameworks.get(selection["framework_id"]) else [selection["framework_id"]],
            "architecture_id": [] if architectures.get(selection["architecture_id"]) else [selection["architecture_id"]],
            "archetype_id": [] if archetypes.get(selection["archetype_id"]) else [selection["archetype_id"]],
            "locale": [] if locales.get(selection["locale"]) else [selection["locale"]],
        },
    }


def calculate_complexity(selection: dict[str, Any], resolved: dict[str, Any]) -> dict[str, Any]:
    architecture = resolved["architecture"]
    framework = resolved["framework"]
    capabilities = resolved["capabilities"]
    modules = resolved["business_modules"]
    endpoints = resolved["endpoints"]

    architecture_score = {
        "low": 14,
        "medium": 28,
        "high": 52,
        "very_high": 76,
    }.get((architecture or {}).get("complexity_level", ""), 10)

    maturity_penalty = {
        "growing": 10,
        "mature": 5,
        "enterprise": 1,
    }.get((framework or {}).get("maturity_level", ""), 6)

    security_pressure = 0
    for capability in capabilities:
        security_pressure += {
            "low": 1,
            "medium": 2,
            "high": 4,
            "critical": 7,
        }.get(capability["security_impact"], 1)

    required_infrastructure = _required_infrastructure(architecture, capabilities)
    infrastructure_overhead = len(required_infrastructure) * 4
    capability_weight = len(capabilities) * 4
    module_weight = len(modules) * 3
    endpoint_weight = min(len(endpoints) * 2, 20)

    overall_score = min(
        100,
        architecture_score
        + maturity_penalty
        + capability_weight
        + module_weight
        + endpoint_weight
        + infrastructure_overhead
        + security_pressure,
    )

    band = _band_for_score(overall_score)
    infrastructure_band = _band_for_score(min(100, architecture_score + infrastructure_overhead + len(required_infrastructure) * 5))
    maintenance_band = _band_for_score(min(100, architecture_score + module_weight + endpoint_weight + security_pressure))

    team_size = {
        "low": "1-2 engineers",
        "medium": "2-4 engineers",
        "high": "4-8 engineers",
        "enterprise": "6-12 engineers",
        "hyperscale": "10+ engineers",
    }[band]

    return {
        "overall_score": overall_score,
        "learning_curve": band,
        "implementation_effort": band,
        "infrastructure_cost": infrastructure_band,
        "maintenance_cost": maintenance_band,
        "team_size_recommendation": team_size,
        "risk_level": band,
    }


def validate_blueprint(selection: dict[str, Any], resolved: dict[str, Any]) -> dict[str, Any]:
    errors: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    suggestions: list[str] = []

    language = resolved["language"]
    runtime = resolved["runtime"]
    framework = resolved["framework"]
    architecture = resolved["architecture"]
    archetype = resolved["archetype"]
    capabilities = resolved["capabilities"]
    modules = resolved["business_modules"]
    endpoints = resolved["endpoints"]

    capability_ids = set(selection["capability_ids"])
    module_ids = set(selection["business_module_ids"])

    if not selection["project_name"]:
        errors.append(_issue("project_name_missing", "Project name is required before generation.", []))
    for field in requirements_missing_fields(selection["project_requirements"]):
        errors.append(
            _issue(
                f"requirements_{field}_missing",
                f"Project requirement '{field}' is required before generation.",
                [field],
            )
        )
    if not modules:
        errors.append(_issue("requirements_business_modules_missing", "At least one business module is required before generation.", []))
    if not endpoints:
        errors.append(_issue("requirements_endpoints_missing", "At least one endpoint is required before generation.", []))

    for field_name, label in (
        ("language_id", "language"),
        ("runtime_id", "runtime"),
        ("framework_id", "framework"),
        ("architecture_id", "architecture"),
        ("archetype_id", "archetype"),
        ("locale", "locale"),
    ):
        for missing_id in resolved["missing"][field_name]:
            errors.append(_issue("selection_not_found", f"Selected {label} '{missing_id}' was not found.", [missing_id]))

    for missing_id in resolved["missing"]["capability_ids"]:
        errors.append(_issue("capability_not_found", f"Capability '{missing_id}' was not found.", [missing_id]))
    for missing_id in resolved["missing"]["business_module_ids"]:
        errors.append(_issue("business_module_not_found", f"Business module '{missing_id}' was not found.", [missing_id]))
    for missing_id in resolved["missing"]["endpoint_ids"]:
        errors.append(_issue("endpoint_not_found", f"Endpoint '{missing_id}' was not found.", [missing_id]))

    if selection["generation_mode"] not in ALLOWED_GENERATION_MODES:
        errors.append(
            _issue(
                "generation_mode_invalid",
                f"Generation mode '{selection['generation_mode']}' is not supported in foundation mode.",
                [selection["generation_mode"]],
            )
        )

    if language and runtime and runtime["id"] not in language["supported_runtimes"]:
        errors.append(
            _issue(
                "runtime_language_incompatible",
                f"Language '{language['id']}' does not support runtime '{runtime['id']}'.",
                [language["id"], runtime["id"]],
            )
        )

    if language and framework and framework["id"] not in language["supported_frameworks"]:
        errors.append(
            _issue(
                "framework_language_incompatible",
                f"Language '{language['id']}' does not support framework '{framework['id']}'.",
                [language["id"], framework["id"]],
            )
        )

    if runtime and framework and framework["id"] not in runtime["supported_frameworks"]:
        errors.append(
            _issue(
                "framework_runtime_incompatible",
                f"Runtime '{runtime['id']}' does not support framework '{framework['id']}'.",
                [runtime["id"], framework["id"]],
            )
        )

    if runtime and framework and framework["runtime_id"] != runtime["id"]:
        warnings.append(
            _issue(
                "framework_runtime_noncanonical",
                f"Framework '{framework['id']}' is canonically paired with runtime '{framework['runtime_id']}'.",
                [framework["id"], runtime["id"]],
            )
        )

    if framework and architecture and architecture["id"] not in framework["architecture_support"]:
        errors.append(
            _issue(
                "framework_architecture_incompatible",
                f"Framework '{framework['id']}' does not support architecture '{architecture['id']}'.",
                [framework["id"], architecture["id"]],
            )
        )

    if architecture and framework and framework["id"] not in architecture["supported_frameworks"]:
        errors.append(
            _issue(
                "architecture_framework_incompatible",
                f"Architecture '{architecture['id']}' does not support framework '{framework['id']}'.",
                [architecture["id"], framework["id"]],
            )
        )

    if archetype and framework and framework["id"] not in archetype["supported_frameworks"]:
        errors.append(
            _issue(
                "archetype_framework_incompatible",
                f"Archetype '{archetype['id']}' does not support framework '{framework['id']}'.",
                [archetype["id"], framework["id"]],
            )
        )

    if archetype and architecture and architecture["id"] not in archetype["supported_architectures"]:
        errors.append(
            _issue(
                "archetype_architecture_incompatible",
                f"Archetype '{archetype['id']}' does not support architecture '{architecture['id']}'.",
                [archetype["id"], architecture["id"]],
            )
        )

    if archetype and selection["locale"] not in archetype["supported_locales"]:
        errors.append(
            _issue(
                "locale_not_supported",
                f"Locale '{selection['locale']}' is not supported by archetype '{archetype['id']}'.",
                [selection["locale"], archetype["id"]],
            )
        )

    if architecture:
        for required_capability in architecture["required_capabilities"]:
            if required_capability not in capability_ids:
                errors.append(
                    _issue(
                        "architecture_capability_missing",
                        f"Architecture '{architecture['id']}' requires capability '{required_capability}'.",
                        [architecture["id"], required_capability],
                    )
                )
                suggestions.append(f"Add required capability '{required_capability}' for architecture '{architecture['name']}'.")

    for capability in capabilities:
        if framework and framework["id"] not in capability["supported_frameworks"]:
            errors.append(
                _issue(
                    "capability_framework_incompatible",
                    f"Capability '{capability['id']}' does not support framework '{framework['id']}'.",
                    [capability["id"], framework["id"]],
                )
            )
        if architecture and architecture["id"] not in capability["architecture_ids"]:
            errors.append(
                _issue(
                    "capability_architecture_incompatible",
                    f"Capability '{capability['id']}' does not support architecture '{architecture['id']}'.",
                    [capability["id"], architecture["id"]],
                )
            )
        for required_capability in capability["requires"]:
            if required_capability not in capability_ids:
                errors.append(
                    _issue(
                        "capability_requirement_missing",
                        f"Capability '{capability['id']}' requires capability '{required_capability}'.",
                        [capability["id"], required_capability],
                    )
                )
                suggestions.append(f"Add dependent capability '{required_capability}' for '{capability['name']}'.")
        for conflict_capability in capability["conflicts_with"]:
            if conflict_capability in capability_ids:
                errors.append(
                    _issue(
                        "capability_conflict",
                        f"Capability '{capability['id']}' conflicts with capability '{conflict_capability}'.",
                        [capability["id"], conflict_capability],
                    )
                )

    for module in modules:
        if framework and framework["id"] not in module["supported_frameworks"]:
            errors.append(
                _issue(
                    "module_framework_incompatible",
                    f"Business module '{module['id']}' does not support framework '{framework['id']}'.",
                    [module["id"], framework["id"]],
                )
            )

    for endpoint in endpoints:
        if framework and framework["id"] not in endpoint["supported_frameworks"]:
            errors.append(
                _issue(
                    "endpoint_framework_incompatible",
                    f"Endpoint '{endpoint['id']}' does not support framework '{framework['id']}'.",
                    [endpoint["id"], framework["id"]],
                )
            )
        if architecture and architecture["id"] not in endpoint["supported_architectures"]:
            errors.append(
                _issue(
                    "endpoint_architecture_incompatible",
                    f"Endpoint '{endpoint['id']}' does not support architecture '{architecture['id']}'.",
                    [endpoint["id"], architecture["id"]],
                )
            )
        if endpoint.get("business_module_id") and endpoint["business_module_id"] not in module_ids:
            errors.append(
                _issue(
                    "endpoint_module_missing",
                    f"Endpoint '{endpoint['id']}' requires business module '{endpoint['business_module_id']}'.",
                    [endpoint["id"], endpoint["business_module_id"]],
                )
            )
            suggestions.append(f"Add business module '{endpoint['business_module_id']}' or remove endpoint '{endpoint['id']}'.")
        missing_required_capabilities = [
            required_capability
            for required_capability in endpoint["required_capabilities"]
            if required_capability not in capability_ids
        ]
        if missing_required_capabilities:
            errors.append(
                _issue(
                    "endpoint_capabilities_missing",
                    f"Endpoint '{endpoint['id']}' requires capabilities: {', '.join(missing_required_capabilities)}.",
                    [endpoint["id"], *missing_required_capabilities],
                )
            )
            suggestions.append(f"Add required capabilities for endpoint '{endpoint['id']}' or remove it from the blueprint.")

    if framework and framework["id"] == "spring_boot" and not (language and runtime and language["id"] == "java" and runtime["id"] == "jvm"):
        errors.append(
            _issue(
                "spring_boot_requires_java_jvm",
                "Spring Boot requires the Java language and JVM runtime.",
                [selection["language_id"], selection["runtime_id"], framework["id"]],
            )
        )

    if framework and framework["id"] == "nestjs" and not (language and runtime and language["id"] in {"typescript", "javascript"} and runtime["id"] == "nodejs"):
        errors.append(
            _issue(
                "nestjs_requires_ts_node",
                "NestJS requires TypeScript or JavaScript on Node.js.",
                [selection["language_id"], selection["runtime_id"], framework["id"]],
            )
        )

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "suggestions": list(dict.fromkeys(suggestions)),
    }


def generate_recommendations(selection: dict[str, Any], resolved: dict[str, Any], validation: dict[str, Any]) -> list[dict[str, Any]]:
    recommendations: list[dict[str, Any]] = []
    capability_ids = set(selection["capability_ids"])
    module_ids = set(selection["business_module_ids"])
    architecture = resolved["architecture"]
    archetype = resolved["archetype"]

    def push(rec_type: str, message: str, severity: str, related_item_id: str | None = None) -> None:
        candidate = {
            "type": rec_type,
            "message": message,
            "severity": severity,
            "related_item_id": related_item_id,
        }
        if candidate not in recommendations:
            recommendations.append(candidate)

    if "authentication" in capability_ids and "rbac" not in capability_ids:
        push("security", "Authentication is selected without RBAC. Add RBAC for stronger enterprise control.", "warning", "rbac")

    if "ai_chat" in capability_ids:
        if "rate_limiting" not in capability_ids:
            push("security", "AI Chat benefits from rate limiting to protect shared runtime capacity.", "warning", "rate_limiting")
        if "observability" not in capability_ids:
            push("operations", "AI Chat should be paired with observability for prompt, latency and failure tracking.", "warning", "observability")

    if "payments" in capability_ids and "audit_logs" not in capability_ids:
        push("security", "Payments should include audit logs for traceability and operational review.", "warning", "audit_logs")

    if architecture and architecture["id"] == "microservices":
        for capability_id in ("docker", "observability", "queue"):
            if capability_id not in capability_ids:
                push("architecture", f"Microservices usually require or strongly benefit from '{capability_id}'.", "critical" if capability_id == "docker" else "warning", capability_id)

    if archetype and archetype["id"] == "landing_page":
        for capability_id in ("seo", "analytics"):
            if capability_id not in capability_ids:
                push("capability", f"Landing pages usually benefit from '{capability_id}' to improve acquisition feedback loops.", "info", capability_id)

    if selection["locale"] != "pt-BR" and "i18n" not in capability_ids:
        push("locale", "Non-default locale selections benefit from i18n to keep the blueprint localization-ready.", "info", "i18n")

    if "payments" in capability_ids and "payments" not in module_ids:
        push("module", "Payments capability is selected without the Payments business module.", "warning", "payments")

    if validation["warnings"]:
        push("delivery", "Address validation warnings before promoting this blueprint to later phases.", "info")

    return recommendations


def build_blueprint(selection: dict[str, Any], repository: RegistryRepository | None = None) -> dict[str, Any]:
    normalized = normalize_selection(selection)
    locale_profile = LocalizationService().profile(normalized["locale"])
    resolved = resolve_profiles(normalized, repository=repository)
    validation = validate_blueprint(normalized, resolved)
    complexity_profile = calculate_complexity(normalized, resolved)
    recommendations = generate_recommendations(normalized, resolved, validation)
    dependency_graph_snapshot = generate_dependency_snapshot(
        {
            "language_id": normalized["language_id"],
            "framework_id": normalized["framework_id"],
            "architecture_id": normalized["architecture_id"],
            "capability_ids": normalized["capability_ids"],
            "infrastructure_ids": normalized["infrastructure_component_ids"],
            "archetype_id": normalized["archetype_id"],
            "architecture_level": (resolved["architecture"] or {}).get("complexity_level") or "unknown",
        }
    )
    infrastructure_service = InfrastructureRegistryService()
    infrastructure_profile = infrastructure_service.build_profile(
        {
            "language_id": normalized["language_id"],
            "runtime_id": normalized["runtime_id"],
            "framework_id": normalized["framework_id"],
            "architecture_id": normalized["architecture_id"],
            "archetype_id": normalized["archetype_id"],
            "capability_ids": normalized["capability_ids"],
            "architecture_level": (resolved["architecture"] or {}).get("complexity_level") or "unknown",
            "selected_component_ids": normalized["infrastructure_component_ids"],
        }
    )

    language = _entity_or_placeholder(
        resolved["language"],
        normalized["language_id"],
        {
            "description": "Unknown language selection.",
            "ecosystem": "unknown",
            "supported_runtimes": [],
            "supported_frameworks": [],
            "supported_architectures": [],
            "enterprise_score": 0,
            "learning_curve": "unknown",
            "performance_profile": "unknown",
            "scalability_profile": "unknown",
        },
    )
    runtime = _entity_or_placeholder(
        resolved["runtime"],
        normalized["runtime_id"],
        {
            "name": normalized["runtime_id"] or "Unknown runtime",
            "description": "Unknown runtime selection.",
            "language_id": normalized["language_id"],
            "supported_frameworks": [],
            "deployment_profiles": [],
            "performance_profile": "unknown",
        },
    )
    framework = _entity_or_placeholder(
        resolved["framework"],
        normalized["framework_id"],
        {
            "name": normalized["framework_id"] or "Unknown framework",
            "language_id": normalized["language_id"],
            "runtime_id": normalized["runtime_id"],
            "framework_type": "unknown",
            "description": "Unknown framework selection.",
            "architecture_support": [],
            "archetype_support": [],
            "capability_support": [],
            "enterprise_score": 0,
            "maturity_level": "growing",
            "recommended_use_cases": [],
        },
    )
    architecture = _entity_or_placeholder(
        resolved["architecture"],
        normalized["architecture_id"],
        {
            "name": normalized["architecture_id"] or "Unknown architecture",
            "description": "Unknown architecture selection.",
            "complexity_level": "low",
            "supported_frameworks": [],
            "required_capabilities": [],
            "recommended_capabilities": [],
            "scalability_profile": "team",
            "deployment_complexity": "low",
        },
    )
    archetype = _entity_or_placeholder(
        resolved["archetype"],
        normalized["archetype_id"],
        {
            "name": normalized["archetype_id"] or "Unknown archetype",
            "description": "Unknown archetype selection.",
            "category": "unknown",
            "supported_frameworks": [],
            "recommended_frameworks": [],
            "default_capabilities": [],
            "recommended_business_modules": [],
            "default_endpoints": [],
            "supported_architectures": [],
            "supported_locales": [],
            "complexity_range": {"minimum": 1, "maximum": 5},
            "preview_type": "unknown",
        },
    )

    return {
        "blueprint_id": str(uuid4()),
        "project_name": normalized["project_name"],
        "locale": normalized["locale"],
        "locale_profile": locale_profile,
        "generation_mode": normalized["generation_mode"],
        "project_requirements": normalized["project_requirements"],
        "technology_graph": {
            "language": language,
            "runtime": runtime,
            "framework": framework,
            "architecture": architecture,
        },
        "architecture_profile": {
            "architecture_id": architecture["id"],
            "complexity_level": architecture["complexity_level"],
            "deployment_complexity": architecture["deployment_complexity"],
            "scalability_profile": architecture["scalability_profile"],
            "required_infrastructure": _required_infrastructure(architecture, resolved["capabilities"]),
            "recommended_patterns": ARCHITECTURE_PATTERNS.get(architecture["id"], ["progressive modularization"]),
        },
        "archetype_profile": {
            "archetype_id": archetype["id"],
            "name": archetype["name"],
            "category": archetype["category"],
            "preview_type": archetype["preview_type"],
            "supported_locales": archetype["supported_locales"],
        },
        "infrastructure_profile": {
            "architecture_level": infrastructure_profile["architecture_level"],
            "selected_component_ids": infrastructure_profile["selected_component_ids"],
            "recommended_component_ids": infrastructure_profile["recommendation"]["recommended"],
            "required_component_ids": infrastructure_profile["recommendation"]["required"],
            "optional_component_ids": infrastructure_profile["recommendation"]["optional"],
            "warnings": infrastructure_profile["recommendation"]["warnings"],
            "rationale": infrastructure_profile["recommendation"]["rationale"],
        },
        "capabilities": resolved["capabilities"],
        "business_modules": resolved["business_modules"],
        "endpoints": resolved["endpoints"],
        "complexity_profile": complexity_profile,
        "validation": validation,
        "recommendations": recommendations,
        "dependency_graph_snapshot": dependency_graph_snapshot,
        "generated_at": datetime.now(UTC).isoformat(),
        "contractVersion": CONTRACT_VERSION,
    }


def _entity_or_placeholder(current: dict[str, Any] | None, item_id: str, defaults: dict[str, Any]) -> dict[str, Any]:
    if current is not None:
        return current
    return {"contractVersion": CONTRACT_VERSION, "id": item_id or "unknown", **defaults}


def _required_infrastructure(architecture: dict[str, Any] | None, capabilities: Sequence[dict[str, Any]]) -> list[str]:
    infra: list[str] = []
    if architecture is not None:
        architecture_id = architecture["id"]
        if architecture_id in {"monolith", "modular_monolith", "clean_architecture", "hexagonal"}:
            infra.extend(["application runtime", "primary data store"])
        if architecture_id in {"microservices", "distributed_system"}:
            infra.extend(["container runtime", "service networking", "centralized logs"])
        if architecture_id == "event_driven":
            infra.extend(["message broker", "event consumer workers"])
        if architecture_id == "serverless":
            infra.extend(["managed function platform", "cloud event triggers"])

    capability_ids = {item["id"] for item in capabilities}
    if "docker" in capability_ids:
        infra.append("container build pipeline")
    if "queue" in capability_ids:
        infra.append("queue or broker service")
    if "observability" in capability_ids:
        infra.append("metrics, logs and tracing stack")
    if "payments" in capability_ids:
        infra.append("secret management and webhook handling")
    if "ai_chat" in capability_ids:
        infra.append("request throttling and AI provider boundary")

    return list(dict.fromkeys(infra))


def _issue(code: str, message: str, related_item_ids: Sequence[str]) -> dict[str, Any]:
    return {
        "code": code,
        "message": message,
        "related_item_ids": list(dict.fromkeys(item for item in related_item_ids if item)),
    }


def _band_for_score(score: int) -> str:
    if score >= 90:
        return "hyperscale"
    if score >= 72:
        return "enterprise"
    if score >= 50:
        return "high"
    if score >= 28:
        return "medium"
    return "low"
