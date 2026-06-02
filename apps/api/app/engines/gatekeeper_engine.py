from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.data.foundation import CONTRACT_VERSION
from app.engines.engineering_readiness_engine import calculate_engineering_readiness


TRACE_REDACTIONS = ["sensitive_fields", "protected_values", "hidden_runtime_material"]
CHECK_DEFINITIONS = [
    ("technology_graph_check", "Technology Graph Check"),
    ("architecture_compatibility_check", "Architecture Compatibility Check"),
    ("business_module_check", "Business Module Check"),
    ("endpoint_plan_check", "Endpoint Plan Check"),
    ("capability_dependency_check", "Capability Dependency Check"),
    ("engineering_readiness_check", "Engineering Readiness Check"),
    ("security_baseline_check", "Security Baseline Check"),
    ("testing_baseline_check", "Testing Baseline Check"),
    ("documentation_baseline_check", "Documentation Baseline Check"),
    ("generation_constraint_check", "Generation Constraint Check"),
    ("locale_i18n_check", "Locale/i18n Check"),
    ("secret_exposure_check", "Secret Exposure Check"),
    ("trace_safety_check", "Trace Safety Check"),
]


def build_gatekeeper_report(blueprint: dict[str, Any], prompt_master: dict[str, Any]) -> dict[str, Any]:
    checks = run_gatekeeper_checks(blueprint, prompt_master)
    blockers = [message for check in checks for message in check["blockers"]]
    warnings = [message for check in checks for message in check["warnings"]]
    decision = _resolve_decision(checks)
    generated_at = datetime.now(UTC).isoformat()

    return {
        "gatekeeper_report_id": str(uuid4()),
        "blueprint_id": blueprint["blueprint_id"],
        "prompt_master_id": prompt_master["prompt_master_id"],
        "decision": decision,
        "summary": _build_summary(decision, checks),
        "blockers": blockers,
        "warnings": warnings,
        "checks": checks,
        "trace": {
            "blueprint_id": blueprint["blueprint_id"],
            "prompt_master_id": prompt_master["prompt_master_id"],
            "check_ids": [check["id"] for check in checks],
            "redacted_fields": TRACE_REDACTIONS,
            "contains_secrets": False,
        },
        "generated_at": generated_at,
        "contractVersion": CONTRACT_VERSION,
    }


def run_gatekeeper_checks(blueprint: dict[str, Any], prompt_master: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        _technology_graph_check(blueprint, prompt_master),
        _architecture_compatibility_check(blueprint, prompt_master),
        _business_module_check(blueprint, prompt_master),
        _endpoint_plan_check(blueprint, prompt_master),
        _capability_dependency_check(blueprint, prompt_master),
        _engineering_readiness_check(blueprint, prompt_master),
        _security_baseline_check(blueprint, prompt_master),
        _testing_baseline_check(blueprint, prompt_master),
        _documentation_baseline_check(blueprint, prompt_master),
        _generation_constraint_check(blueprint, prompt_master),
        _locale_i18n_check(blueprint, prompt_master),
        _secret_exposure_check(blueprint, prompt_master),
        _trace_safety_check(blueprint, prompt_master),
    ]


def _technology_graph_check(blueprint: dict[str, Any], prompt_master: dict[str, Any]) -> dict[str, Any]:
    tg = blueprint["technology_graph"]
    compiled = prompt_master["compiled_prompt"]
    blockers: list[str] = []
    warnings: list[str] = []
    related = [
        tg["language"]["id"],
        tg["runtime"]["id"],
        tg["framework"]["id"],
        tg["architecture"]["id"],
    ]
    for label, entity in (
        ("language", tg["language"]),
        ("runtime", tg["runtime"]),
        ("framework", tg["framework"]),
        ("architecture", tg["architecture"]),
    ):
        if entity["name"] not in compiled and entity["id"] not in compiled:
            blockers.append(f"Prompt Master is missing the resolved {label} '{entity['id']}' from the technology graph.")
    return _build_check(
        "technology_graph_check",
        "Technology Graph Check",
        blockers,
        warnings,
        related,
        "Verifies that the Prompt Master preserves the exact blueprint technology path.",
    )


def _architecture_compatibility_check(blueprint: dict[str, Any], prompt_master: dict[str, Any]) -> dict[str, Any]:
    blockers: list[str] = []
    warnings: list[str] = []
    architecture_id = blueprint["technology_graph"]["architecture"]["id"]
    framework_id = blueprint["technology_graph"]["framework"]["id"]
    sections = {section["id"]: section for section in prompt_master["sections"]}
    architecture_section = sections.get("architecture_profile")
    if architecture_section is None:
        blockers.append("Prompt Master is missing the Architecture Profile section.")
    else:
        architecture_text = f"{architecture_section['summary']} {architecture_section['content']} {' '.join(architecture_section['bullets'])}"
        if architecture_id not in architecture_text and blueprint["technology_graph"]["architecture"]["name"] not in architecture_text:
            blockers.append(f"Architecture Profile does not preserve architecture '{architecture_id}'.")
        if framework_id not in prompt_master["compiled_prompt"] and blueprint["technology_graph"]["framework"]["name"] not in prompt_master["compiled_prompt"]:
            blockers.append(f"Prompt Master compiled contract does not preserve framework '{framework_id}'.")
    return _build_check(
        "architecture_compatibility_check",
        "Architecture Compatibility Check",
        blockers,
        warnings,
        [architecture_id, framework_id],
        "Verifies architecture and framework consistency across blueprint and Prompt Master.",
    )


def _business_module_check(blueprint: dict[str, Any], prompt_master: dict[str, Any]) -> dict[str, Any]:
    modules = blueprint["business_modules"]
    section = _find_section(prompt_master, "business_modules")
    blockers: list[str] = []
    warnings: list[str] = []
    for module in modules:
        if section is None or (module["id"] not in section["content"] and all(module["id"] not in bullet for bullet in section["bullets"])):
            blockers.append(f"Business module '{module['id']}' is not fully represented in the Prompt Master.")
    return _build_check(
        "business_module_check",
        "Business Module Check",
        blockers,
        warnings,
        [module["id"] for module in modules],
        "Verifies that selected blueprint modules remain visible in the Prompt Master.",
    )


def _endpoint_plan_check(blueprint: dict[str, Any], prompt_master: dict[str, Any]) -> dict[str, Any]:
    endpoints = blueprint["endpoints"]
    section = _find_section(prompt_master, "endpoint_plan")
    blockers: list[str] = []
    warnings: list[str] = []
    for endpoint in endpoints:
        endpoint_signature = f"{endpoint['method']} {endpoint['path']}"
        if section is None or (endpoint_signature not in section["content"] and all(endpoint["id"] not in bullet and endpoint_signature not in bullet for bullet in section["bullets"])):
            blockers.append(f"Endpoint '{endpoint['id']}' is missing from the Prompt Master endpoint plan.")
    return _build_check(
        "endpoint_plan_check",
        "Endpoint Plan Check",
        blockers,
        warnings,
        [endpoint["id"] for endpoint in endpoints],
        "Verifies that the Prompt Master endpoint plan covers the blueprint endpoint set.",
    )


def _capability_dependency_check(blueprint: dict[str, Any], prompt_master: dict[str, Any]) -> dict[str, Any]:
    blockers: list[str] = []
    warnings: list[str] = []
    capability_ids = {item["id"] for item in blueprint["capabilities"]}
    blueprint_errors = blueprint["validation"]["errors"]
    prompt_sections = {section["id"]: section for section in prompt_master["sections"]}
    capability_section = prompt_sections.get("capability_plan")
    dependency_snapshot = blueprint.get("dependency_graph_snapshot") or {}
    propagation = dependency_snapshot.get("propagation") or {}
    readiness = dependency_snapshot.get("readiness_profile") or {}
    risk_profile = dependency_snapshot.get("risk_profile") or {}
    selected_infra_ids = set(blueprint.get("infrastructure_profile", {}).get("selected_component_ids", []))

    if not blueprint["validation"]["valid"]:
        dependency_error_codes = {
            "endpoint_capabilities_missing",
            "capability_requirement_missing",
            "architecture_capability_missing",
        }
        if any(error["code"] in dependency_error_codes for error in blueprint_errors):
            blockers.append("Blueprint still contains unresolved capability dependency errors.")

    if propagation.get("required_node_ids"):
        missing_required = [
            dependency_id
            for dependency_id in propagation["required_node_ids"]
            if dependency_id not in capability_ids
            and dependency_id not in selected_infra_ids
        ]
        if missing_required:
            blockers.append(
                "Dependency propagation left required nodes unresolved: " + ", ".join(sorted(dict.fromkeys(missing_required)))
            )
    if readiness.get("blockers"):
        warnings.extend(readiness["blockers"])
    if risk_profile.get("issues"):
        warnings.extend(
            f"Dependency risk signal: {issue['title']}"
            for issue in risk_profile["issues"]
            if issue.get("severity") in {"warning", "critical"}
        )

    for capability in blueprint["capabilities"]:
        if capability_section is not None and capability["id"] not in capability_section["content"] and all(capability["id"] not in bullet for bullet in capability_section["bullets"]):
            warnings.append(f"Capability '{capability['id']}' is not explicitly surfaced in the Prompt Master capability plan.")

    if "observability" in propagation.get("required_node_ids", []) and "observability" not in capability_ids:
        warnings.append("Observability is required by the dependency graph and should be explicitly selected.")
    if "rate_limiting" in propagation.get("required_node_ids", []) and "rate_limiting" not in capability_ids:
        warnings.append("Rate limiting is required by the dependency graph and should be explicitly selected.")
    if "vector_database" in propagation.get("required_node_ids", []) and "vector_database" not in capability_ids:
        warnings.append("Vector database support is required by the dependency graph and should be explicitly selected.")

    return _build_check(
        "capability_dependency_check",
        "Capability Dependency Check",
        blockers,
        warnings,
        list(capability_ids),
        "Verifies that capability dependencies are resolved and visible.",
    )


def _security_baseline_check(blueprint: dict[str, Any], prompt_master: dict[str, Any]) -> dict[str, Any]:
    blockers: list[str] = []
    warnings: list[str] = []
    capability_ids = {item["id"] for item in blueprint["capabilities"]}
    recommendation_ids = {item.get("related_item_id") for item in blueprint.get("recommendations", [])}
    security_section = _find_section(prompt_master, "security_requirements")

    if not blueprint["validation"]["valid"] and any(
        error["code"] in {"endpoint_capabilities_missing", "capability_requirement_missing"}
        for error in blueprint["validation"]["errors"]
    ):
        blockers.append("Security-sensitive capability dependencies are still unresolved in the blueprint.")

    if "authentication" in capability_ids and "rbac" not in capability_ids:
        warnings.append("Authentication is present without RBAC, which weakens the security baseline.")
    if "ai_chat" in capability_ids and "rate_limiting" not in capability_ids:
        warnings.append("AI Chat is present without rate limiting in the capability set.")
    if "payments" in capability_ids and "audit_logs" not in capability_ids:
        warnings.append("Payments is present without audit logs in the capability set.")

    if security_section is None:
        blockers.append("Prompt Master is missing the Security Requirements section.")
    elif any(item in recommendation_ids for item in {"rbac", "rate_limiting", "audit_logs"}):
        warnings.append("Prompt Master inherits security recommendations that should be resolved before generation.")

    return _build_check(
        "security_baseline_check",
        "Security Baseline Check",
        blockers,
        warnings,
        sorted(item for item in capability_ids if item),
        "Verifies that security-critical capabilities and recommendations are acknowledged.",
    )


def _engineering_readiness_check(blueprint: dict[str, Any], prompt_master: dict[str, Any]) -> dict[str, Any]:
    del prompt_master
    technology_graph = blueprint["technology_graph"]
    capability_ids = [item["id"] for item in blueprint["capabilities"]]
    infrastructure_ids = blueprint.get("infrastructure_profile", {}).get("selected_component_ids", [])
    readiness = calculate_engineering_readiness(
        {
            "language_id": technology_graph["language"]["id"],
            "framework_id": technology_graph["framework"]["id"],
            "architecture_id": technology_graph["architecture"]["id"],
            "capability_ids": capability_ids,
            "infrastructure_ids": infrastructure_ids,
        }
    )
    production = readiness["production_readiness"]
    burden = readiness["operational_burden"]
    blockers: list[str] = []
    warnings: list[str] = []

    if production["score"] < 35:
        blockers.append("Engineering production readiness is below prototype safety.")
    if "kubernetes" in infrastructure_ids and "observability" not in capability_ids:
        warnings.append("Kubernetes is selected without observability in the engineering readiness baseline.")
    if technology_graph["architecture"]["id"] == "microservices":
        warnings.append("Microservices require DevOps baseline and platform maturity before production.")
    if any(item in capability_ids for item in {"ai_chat", "rag"}) and "observability" not in capability_ids:
        warnings.append("AI infrastructure is selected without monitoring in the engineering readiness baseline.")
    warnings.extend(production["missing_baselines"])
    warnings.extend(
        risk["summary"]
        for risk in readiness["engineering_risks"]
        if risk["severity"] in {"warning", "critical"}
    )

    return _build_check(
        "engineering_readiness_check",
        "Engineering Readiness Check",
        blockers,
        list(dict.fromkeys(warnings)),
        [technology_graph["architecture"]["id"], technology_graph["framework"]["id"], burden["level"]],
        "Uses production, operational, and team readiness signals before progression.",
    )


def _testing_baseline_check(blueprint: dict[str, Any], prompt_master: dict[str, Any]) -> dict[str, Any]:
    blockers: list[str] = []
    warnings: list[str] = []
    section = _find_section(prompt_master, "testing_requirements")
    if section is None:
        blockers.append("Prompt Master is missing the Testing Requirements section.")
    else:
        combined = f"{section['content']} {' '.join(section['bullets'])}".lower()
        for keyword in ("unit tests", "integration tests", "validation"):
            if keyword not in combined:
                warnings.append(f"Testing baseline does not clearly mention '{keyword}'.")
    return _build_check(
        "testing_baseline_check",
        "Testing Baseline Check",
        blockers,
        warnings,
        ["testing_requirements"],
        "Verifies baseline testing guidance before future generation phases.",
    )


def _documentation_baseline_check(blueprint: dict[str, Any], prompt_master: dict[str, Any]) -> dict[str, Any]:
    blockers: list[str] = []
    warnings: list[str] = []
    section = _find_section(prompt_master, "documentation_requirements")
    if section is None:
        blockers.append("Prompt Master is missing the Documentation Requirements section.")
    else:
        combined = f"{section['content']} {' '.join(section['bullets'])}".lower()
        for keyword in ("technology graph", "module ownership", "endpoint ownership"):
            if keyword not in combined:
                warnings.append(f"Documentation baseline does not clearly mention '{keyword}'.")
    return _build_check(
        "documentation_baseline_check",
        "Documentation Baseline Check",
        blockers,
        warnings,
        ["documentation_requirements"],
        "Verifies that documentation expectations remain explicit.",
    )


def _generation_constraint_check(blueprint: dict[str, Any], prompt_master: dict[str, Any]) -> dict[str, Any]:
    blockers: list[str] = []
    warnings: list[str] = []
    section = _find_section(prompt_master, "generation_constraints")
    compiled = prompt_master["compiled_prompt"].lower()
    forbidden_phrases = ["generate source code", "call an llm", "mutate the source blueprint"]
    if not prompt_master["validation"]["valid"]:
        blockers.append("Prompt Master validation is not healthy, so generation cannot be approved.")
    if not prompt_master.get("source_blueprint_valid", False):
        blockers.append("Prompt Master source blueprint is invalid, so generation cannot be approved.")
    if section is None:
        blockers.append("Prompt Master is missing the Generation Constraints section.")
    else:
        section_text = f"{section['content']} {' '.join(section['bullets'])}".lower()
        for phrase in forbidden_phrases:
            if phrase not in section_text:
                warnings.append(f"Generation constraints do not explicitly preserve rule '{phrase}'.")
    if "execute generation now" in compiled or "create code now" in compiled:
        blockers.append("Prompt Master appears to instruct direct generation, which is forbidden in foundation mode.")
    return _build_check(
        "generation_constraint_check",
        "Generation Constraint Check",
        blockers,
        warnings,
        ["generation_constraints"],
        "Verifies that the Prompt Master remains preview-only and non-generative.",
    )


def _locale_i18n_check(blueprint: dict[str, Any], prompt_master: dict[str, Any]) -> dict[str, Any]:
    blockers: list[str] = []
    warnings: list[str] = []
    locale = blueprint["locale"]
    section = _find_section(prompt_master, "locale_language_rules")
    capability_ids = {item["id"] for item in blueprint["capabilities"]}

    if section is None:
        blockers.append("Prompt Master is missing the Locale / Language Rules section.")
    else:
        section_text = f"{section['content']} {' '.join(section['bullets'])}"
        if locale not in section_text:
            blockers.append(f"Prompt Master locale rules do not preserve locale '{locale}'.")
    if locale != "pt-BR" and "i18n" not in capability_ids:
        warnings.append("Non-default locale is selected without i18n capability.")
    return _build_check(
        "locale_i18n_check",
        "Locale/i18n Check",
        blockers,
        warnings,
        [locale],
        "Verifies locale preservation and i18n baseline expectations.",
    )


def _secret_exposure_check(blueprint: dict[str, Any], prompt_master: dict[str, Any]) -> dict[str, Any]:
    blockers: list[str] = []
    warnings: list[str] = []
    forbidden_tokens = ("secret", "token", "password", "api key", "private key")
    haystacks = [prompt_master["compiled_prompt"]]
    haystacks.extend(section["content"] for section in prompt_master["sections"])
    haystacks.extend(" ".join(section["bullets"]) for section in prompt_master["sections"])
    combined = " ".join(haystacks).lower()

    for token in forbidden_tokens:
        if f"{token}=" in combined or f"{token}:" in combined:
            blockers.append(f"Potential secret exposure pattern detected in Prompt Master content: '{token}'.")

    return _build_check(
        "secret_exposure_check",
        "Secret Exposure Check",
        blockers,
        warnings,
        ["compiled_prompt", "sections"],
        "Verifies that the Prompt Master does not expose secret-like values.",
    )


def _trace_safety_check(blueprint: dict[str, Any], prompt_master: dict[str, Any]) -> dict[str, Any]:
    blockers: list[str] = []
    warnings: list[str] = []
    prompt_trace = prompt_master["trace"]

    if prompt_trace.get("contains_secrets"):
        blockers.append("Prompt Master trace is marked as containing secrets.")

    redacted_fields = prompt_trace.get("redacted_fields") or []
    if not redacted_fields:
        warnings.append("Prompt Master trace does not declare any redacted fields.")

    source_selection = prompt_trace.get("source_selection_ids", {})
    serialized_selection = str(source_selection).lower()
    for token in ("password", "secret=", "token="):
        if token in serialized_selection:
            blockers.append("Prompt Master trace includes secret-like source selection material.")

    return _build_check(
        "trace_safety_check",
        "Trace Safety Check",
        blockers,
        warnings,
        ["trace"],
        "Verifies that trace metadata stays safe and non-sensitive.",
    )


def _find_section(prompt_master: dict[str, Any], section_id: str) -> dict[str, Any] | None:
    return next((section for section in prompt_master["sections"] if section["id"] == section_id), None)


def _build_check(
    check_id: str,
    title: str,
    blockers: list[str],
    warnings: list[str],
    related_item_ids: list[str],
    summary: str,
) -> dict[str, Any]:
    if blockers:
        return {
            "id": check_id,
            "title": title,
            "status": "failed",
            "severity": "critical",
            "summary": summary,
            "blockers": blockers,
            "warnings": warnings,
            "related_item_ids": related_item_ids,
        }
    if warnings:
        return {
            "id": check_id,
            "title": title,
            "status": "warning",
            "severity": "warning",
            "summary": summary,
            "blockers": [],
            "warnings": warnings,
            "related_item_ids": related_item_ids,
        }
    return {
        "id": check_id,
        "title": title,
        "status": "passed",
        "severity": "info",
        "summary": summary,
        "blockers": [],
        "warnings": [],
        "related_item_ids": related_item_ids,
    }


def _resolve_decision(checks: list[dict[str, Any]]) -> str:
    if any(check["status"] == "failed" for check in checks):
        return "blocked"
    if any(check["status"] == "warning" for check in checks):
        return "approved_with_warnings"
    return "approved"


def _build_summary(decision: str, checks: list[dict[str, Any]]) -> str:
    failed = sum(1 for check in checks if check["status"] == "failed")
    warned = sum(1 for check in checks if check["status"] == "warning")
    if decision == "blocked":
        return f"Gatekeeper blocked progression with {failed} failed checks and {warned} warning checks."
    if decision == "approved_with_warnings":
        return f"Gatekeeper approved progression with warnings across {warned} checks."
    return "Gatekeeper approved progression. All mandatory checks passed."
