from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.data.foundation import CONTRACT_VERSION
from app.engines.project_requirements_engine import normalize_project_requirements


PROMPT_MASTER_ENGINE_VERSION = "0.1.0"
PROMPT_MASTER_DOCUMENT_VERSION = "1.0.0"
MANDATORY_SECTIONS = [
    ("product_intent", "Product Intent"),
    ("technology_graph", "Technology Graph"),
    ("architecture_profile", "Architecture Profile"),
    ("business_modules", "Business Modules"),
    ("endpoint_plan", "Endpoint Plan"),
    ("capability_plan", "Capability Plan"),
    ("security_requirements", "Security Requirements"),
    ("data_model_hints", "Data Model Hints"),
    ("testing_requirements", "Testing Requirements"),
    ("documentation_requirements", "Documentation Requirements"),
    ("quality_gates", "Quality Gates"),
    ("forbidden_decisions", "Forbidden Decisions"),
    ("generation_constraints", "Generation Constraints"),
    ("locale_language_rules", "Locale / Language Rules"),
    ("trace", "Trace"),
]
SAFE_TRACE_REDACTIONS = ["sensitive_fields", "protected_values", "hidden_runtime_material"]


def build_prompt_master_document(blueprint: dict[str, Any]) -> dict[str, Any]:
    normalized_blueprint = normalize_blueprint_input(blueprint)
    sections = build_sections(normalized_blueprint)
    validation = validate_prompt_master(normalized_blueprint, sections)
    trace = build_trace(normalized_blueprint, sections)
    generated_at = datetime.now(UTC).isoformat()
    compiled_prompt = compile_prompt_master(sections)

    return {
        "prompt_master_id": str(uuid4()),
        "blueprint_id": normalized_blueprint["blueprint_id"],
        "project_name": normalized_blueprint["project_name"],
        "locale": normalized_blueprint["locale"],
        "locale_profile": normalized_blueprint["locale_profile"],
        "generation_mode": normalized_blueprint["generation_mode"],
        "source_blueprint_valid": normalized_blueprint["validation"]["valid"],
        "version": {
            "document_version": PROMPT_MASTER_DOCUMENT_VERSION,
            "engine_version": PROMPT_MASTER_ENGINE_VERSION,
            "blueprint_contract_version": normalized_blueprint.get("contractVersion", CONTRACT_VERSION),
            "generated_at": generated_at,
        },
        "validation": validation,
        "sections": sections,
        "trace": trace,
        "compiled_prompt": compiled_prompt,
        "generated_at": generated_at,
        "contractVersion": CONTRACT_VERSION,
    }


def normalize_blueprint_input(blueprint: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(blueprint)
    normalized["project_name"] = str(normalized.get("project_name") or "").strip()
    normalized["locale"] = str(normalized.get("locale") or "pt-BR").strip() or "pt-BR"
    normalized["locale_profile"] = normalized.get("locale_profile") or {
        "selected_locale": normalized["locale"],
        "fallback_locale": "pt-BR",
        "generated_docs_locale": normalized["locale"],
        "generated_readme_locale": normalized["locale"],
        "generated_comments_locale": normalized["locale"],
    }
    normalized["generation_mode"] = str(normalized.get("generation_mode") or "foundation_only").strip() or "foundation_only"
    normalized["capabilities"] = list(normalized.get("capabilities") or [])
    normalized["business_modules"] = list(normalized.get("business_modules") or [])
    normalized["endpoints"] = list(normalized.get("endpoints") or [])
    normalized["recommendations"] = list(normalized.get("recommendations") or [])
    normalized["project_requirements"] = normalize_project_requirements(normalized.get("project_requirements"))
    normalized["validation"] = normalized.get("validation") or {
        "valid": False,
        "errors": [{"code": "blueprint_missing_validation", "message": "Blueprint validation was not provided.", "related_item_ids": []}],
        "warnings": [],
        "suggestions": [],
    }
    return normalized


def build_sections(blueprint: dict[str, Any]) -> list[dict[str, Any]]:
    technology_graph = blueprint["technology_graph"]
    architecture_profile = blueprint["architecture_profile"]
    archetype_profile = blueprint["archetype_profile"]
    capabilities = blueprint["capabilities"]
    modules = blueprint["business_modules"]
    endpoints = blueprint["endpoints"]
    complexity = blueprint["complexity_profile"]
    validation = blueprint["validation"]
    recommendations = blueprint["recommendations"]
    requirements = blueprint["project_requirements"]

    warnings = [item["message"] for item in validation["warnings"]]
    recommendation_lines = [item["message"] for item in recommendations]

    sections = [
        _section(
            "product_intent",
            "Product Intent",
            "User-defined product scope preserved directly from the validated blueprint.",
            (
                f"Build '{blueprint['project_name']}' to achieve this goal: {requirements['project_goal']}. "
                f"Business context: {requirements['business_context']}."
            ),
            [
                f"Target users: {', '.join(requirements['target_users']) or 'missing'}",
                f"Delivery target: {requirements['delivery_target'] or 'missing'}",
                f"Archetype: {archetype_profile['name']} ({archetype_profile['category']})",
                f"Generation mode: {blueprint['generation_mode']}",
                f"Complexity score: {complexity['overall_score']} ({complexity['risk_level']})",
                "Do not reinterpret or invent product requirements beyond the user-defined intent.",
            ],
        ),
        _section(
            "technology_graph",
            "Technology Graph",
            "Canonical stack path that later phases must preserve.",
            (
                "Use the exact stack resolved by the blueprint preview. No stack substitution, framework upgrades, "
                "or architecture rewrites are allowed during downstream planning."
            ),
            [
                f"Language: {technology_graph['language']['name']} ({technology_graph['language']['id']})",
                f"Runtime: {technology_graph['runtime']['name']} ({technology_graph['runtime']['id']})",
                f"Framework: {technology_graph['framework']['name']} ({technology_graph['framework']['id']})",
                f"Architecture: {technology_graph['architecture']['name']} ({technology_graph['architecture']['id']})",
            ],
        ),
        _section(
            "architecture_profile",
            "Architecture Profile",
            "Operational and structural expectations copied from the blueprint architecture profile.",
            (
                f"Adopt a {technology_graph['architecture']['name']} structure with deployment complexity "
                f"'{architecture_profile['deployment_complexity']}' and scalability profile "
                f"'{architecture_profile['scalability_profile']}'."
            ),
            [
                f"Required infrastructure: {', '.join(architecture_profile['required_infrastructure']) or 'none'}",
                f"Recommended patterns: {', '.join(architecture_profile['recommended_patterns']) or 'none'}",
                f"Team recommendation: {complexity['team_size_recommendation']}",
                f"Maintenance cost band: {complexity['maintenance_cost']}",
            ],
        ),
        _section(
            "business_modules",
            "Business Modules",
            "Domain boundaries that must remain explicit in future implementation phases.",
            "Model business logic around the selected modules and avoid introducing unselected business domains.",
            [
                f"{module['name']} ({module['id']}): {module['description']}"
                for module in modules
            ] + [f"Business rule: {rule}" for rule in requirements["business_rules"]]
            + [f"Workflow: {workflow}" for workflow in requirements["workflows"]],
        ),
        _section(
            "endpoint_plan",
            "Endpoint Plan",
            "Route contract hints derived from the selected endpoint set.",
            "Only selected endpoints should appear in generation planning unless a future human-approved revision changes the blueprint.",
            [
                f"{endpoint['method']} {endpoint['path']} [{endpoint['id']}]"
                for endpoint in endpoints
            ] or ["No endpoints were selected."],
        ),
        _section(
            "capability_plan",
            "Capability Plan",
            "Cross-cutting capabilities that must shape project scope and implementation sequencing.",
            "Treat selected capabilities as required scope. Treat blueprint recommendations as optional improvements unless promoted by human review.",
            [
                f"{capability['name']} ({capability['id']}): {capability['description']}"
                for capability in capabilities
            ] + ([f"Recommendation: {message}" for message in recommendation_lines] if recommendation_lines else []),
        ),
        _section(
            "security_requirements",
            "Security Requirements",
            "Security obligations inferred from capabilities, endpoints, and blueprint recommendations.",
            "Apply the highest security posture implied by selected capabilities, especially auth, payments, auditability, and rate protection concerns.",
            _security_bullets(capabilities, endpoints, recommendation_lines),
        ),
        _section(
            "data_model_hints",
            "Data Model Hints",
            "Non-authoritative data shape guidance for future design phases.",
            "Use user-defined entities plus module and endpoint ownership to seed aggregates, relationships, and access boundaries.",
            [f"Required entity/data concept: {entity}" for entity in requirements["entities"]]
            + _data_model_hints(modules, endpoints)
            + [f"Constraint: {constraint}" for constraint in requirements["constraints"]],
        ),
        _section(
            "testing_requirements",
            "Testing Requirements",
            "Baseline validation expectations before any implementation is considered acceptable.",
            "Testing must cover business modules, selected endpoints, integration boundaries, and blueprint-derived warnings.",
            [
                "Add unit tests for business rules inside each selected module.",
                "Add integration tests for each selected endpoint and capability dependency.",
                "Add validation coverage for compatibility-sensitive paths called out by the blueprint.",
                f"Match the blueprint risk level with at least a '{complexity['risk_level']}' intensity test strategy.",
            ],
        ),
        _section(
            "documentation_requirements",
            "Documentation Requirements",
            "Technical documentation obligations that preserve blueprint intent.",
            "Documentation must explain why the selected stack, modules, endpoints, and capabilities were preserved exactly as defined in the blueprint.",
            [
                "Document the technology graph and why each node was selected.",
                "Document module ownership and endpoint ownership.",
                "Document environment assumptions and infrastructure expectations.",
                "Document validation warnings and human-approved deviations, if any.",
            ],
        ),
        _section(
            "quality_gates",
            "Quality Gates",
            "Readiness checks that later phases must satisfy before execution advances.",
            "Future planning or generation phases should stop if any critical blueprint incompatibility remains unresolved.",
            [
                "Blueprint validation must remain explicit and visible.",
                "Selected modules and endpoints must remain aligned.",
                "Security-related recommendations should be reviewed before release planning.",
                "No downstream phase may silently repair or replace blueprint decisions.",
            ] + [f"Warning to review: {message}" for message in warnings],
        ),
        _section(
            "forbidden_decisions",
            "Forbidden Decisions",
            "Explicit anti-decisions that prevent scope drift or silent stack invention.",
            "These decisions are forbidden unless a new blueprint revision is produced and approved.",
            _forbidden_decisions(blueprint, recommendation_lines),
        ),
        _section(
            "generation_constraints",
            "Generation Constraints",
            "Hard limits for any future automated or assisted build phase.",
            "This Prompt Master is a planning contract only. It cannot directly trigger code generation.",
            [
                "Do not call an LLM from the foundation engine.",
                "Do not generate source code, migrations, or infrastructure manifests.",
                "Do not mutate the source blueprint during prompt generation.",
                "Use this document only as structured technical input for future human-approved phases.",
            ],
        ),
        _section(
            "locale_language_rules",
            "Locale / Language Rules",
            "Localization and language rules that later phases must preserve.",
            "Output rules must honor the blueprint locale and avoid silently defaulting to another language.",
            [
                f"Primary locale: {blueprint['locale']}",
                f"Archetype supported locales: {', '.join(archetype_profile['supported_locales']) or 'not declared'}",
                "Keep labels, examples, and product wording aligned to the selected locale.",
                "Introduce i18n support only when explicitly selected or recommended and later approved.",
            ],
        ),
        _section(
            "trace",
            "Trace",
            "Safe traceability metadata for audit and debugging without secrets.",
            "Trace only blueprint identifiers and section coverage. Never persist credentials, tokens, or hidden prompts.",
            [
                f"Blueprint id: {blueprint['blueprint_id']}",
                f"Language id: {technology_graph['language']['id']}",
                f"Runtime id: {technology_graph['runtime']['id']}",
                f"Framework id: {technology_graph['framework']['id']}",
                f"Architecture id: {technology_graph['architecture']['id']}",
                f"Archetype id: {archetype_profile['archetype_id']}",
            ],
        ),
    ]

    return sections


def validate_prompt_master(blueprint: dict[str, Any], sections: list[dict[str, Any]]) -> dict[str, Any]:
    errors: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    constraints = [
        "No AI calls are permitted in Prompt Master foundation mode.",
        "No code generation is permitted in Prompt Master foundation mode.",
        "The blueprint cannot be rewritten by the Prompt Master engine.",
    ]

    source_validation = blueprint["validation"]
    section_ids = {section["id"] for section in sections}

    missing_sections = [section_id for section_id, _ in MANDATORY_SECTIONS if section_id not in section_ids]
    if missing_sections:
        errors.append(
            _validation_issue(
                "prompt_master_sections_missing",
                f"Prompt Master is missing mandatory sections: {', '.join(missing_sections)}.",
                missing_sections,
            )
        )

    if not source_validation["valid"]:
        errors.append(
            _validation_issue(
                "source_blueprint_invalid",
                "Prompt Master source blueprint is invalid. Review blueprint errors before downstream execution.",
                ["product_intent", "quality_gates", "trace"],
            )
        )

    for warning in source_validation.get("warnings", []):
        warnings.append(
            _validation_issue(
                f"blueprint_warning_{warning['code']}",
                warning["message"],
                ["quality_gates", "trace"],
            )
        )

    if blueprint.get("recommendations"):
        warnings.append(
            _validation_issue(
                "blueprint_recommendations_present",
                "Prompt Master includes unresolved blueprint recommendations that should be reviewed before later phases.",
                ["capability_plan", "security_requirements", "quality_gates"],
            )
        )

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "constraints": constraints,
    }


def build_trace(blueprint: dict[str, Any], sections: list[dict[str, Any]]) -> dict[str, Any]:
    technology_graph = blueprint["technology_graph"]
    archetype_profile = blueprint["archetype_profile"]

    return {
        "blueprint_id": blueprint["blueprint_id"],
        "source_selection_ids": {
            "language_id": technology_graph["language"]["id"],
            "runtime_id": technology_graph["runtime"]["id"],
            "framework_id": technology_graph["framework"]["id"],
            "architecture_id": technology_graph["architecture"]["id"],
            "archetype_id": archetype_profile["archetype_id"],
            "capability_ids": [item["id"] for item in blueprint["capabilities"]],
            "business_module_ids": [item["id"] for item in blueprint["business_modules"]],
            "endpoint_ids": [item["id"] for item in blueprint["endpoints"]],
        },
        "included_sections": [section["id"] for section in sections],
        "redacted_fields": SAFE_TRACE_REDACTIONS,
        "contains_secrets": False,
    }


def compile_prompt_master(sections: list[dict[str, Any]]) -> str:
    blocks: list[str] = []
    for index, section in enumerate(sections, start=1):
        bullet_lines = "\n".join(f"- {item}" for item in section["bullets"])
        block = (
            f"{index}. {section['title']}\n"
            f"Summary: {section['summary']}\n"
            f"{section['content']}\n"
            f"{bullet_lines}"
        ).strip()
        blocks.append(block)
    return "\n\n".join(blocks)


def _section(section_id: str, title: str, summary: str, content: str, bullets: list[str]) -> dict[str, Any]:
    return {
        "id": section_id,
        "title": title,
        "summary": summary,
        "content": content,
        "bullets": bullets,
    }


def _validation_issue(code: str, message: str, related_section_ids: list[str]) -> dict[str, Any]:
    return {
        "code": code,
        "message": message,
        "related_section_ids": related_section_ids,
    }


def _security_bullets(
    capabilities: list[dict[str, Any]],
    endpoints: list[dict[str, Any]],
    recommendation_lines: list[str],
) -> list[str]:
    capability_ids = {item["id"] for item in capabilities}
    bullets = [
        "Treat authentication and authorization requirements as mandatory when auth-related capabilities are present.",
        "Ensure endpoint access rules follow capability dependencies instead of being inferred ad hoc.",
    ]

    if "payments" in capability_ids:
        bullets.append("Protect payment flows with auditability, webhook verification, and secret isolation boundaries.")
    if "ai_chat" in capability_ids:
        bullets.append("Protect AI-facing routes with rate limiting, observability, and explicit provider isolation.")
    if "audit_logs" in capability_ids:
        bullets.append("Retain auditable event trails for sensitive mutations and privileged operations.")
    if any(endpoint["method"] in {"POST", "PUT", "PATCH", "DELETE"} for endpoint in endpoints):
        bullets.append("Prioritize mutation endpoint validation, access checks, and input constraint coverage.")
    bullets.extend(f"Recommendation to review: {message}" for message in recommendation_lines[:3])
    return bullets


def _data_model_hints(modules: list[dict[str, Any]], endpoints: list[dict[str, Any]]) -> list[str]:
    module_hints = [f"Seed a primary aggregate or bounded context for module '{module['id']}'." for module in modules]
    endpoint_hints = [f"Map endpoint '{endpoint['id']}' to the owning module '{endpoint.get('business_module_id') or 'unassigned'}'." for endpoint in endpoints]
    return module_hints + endpoint_hints or ["No module or endpoint hints were available."]


def _forbidden_decisions(blueprint: dict[str, Any], recommendation_lines: list[str]) -> list[str]:
    technology_graph = blueprint["technology_graph"]
    forbidden = [
        f"Do not replace language '{technology_graph['language']['id']}' with another language.",
        f"Do not replace framework '{technology_graph['framework']['id']}' with another framework.",
        f"Do not replace architecture '{technology_graph['architecture']['id']}' with a different deployment model.",
        "Do not add unselected business modules without revising the blueprint.",
        "Do not create endpoints that bypass selected module ownership.",
        "Do not hide validation errors behind later prompt or generation phases.",
    ]
    if recommendation_lines:
        forbidden.append("Do not treat recommendations as already implemented controls.")
    return forbidden
