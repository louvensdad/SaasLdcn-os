from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.data.foundation import CONTRACT_VERSION

DEP_BANDS = ("low", "medium", "high", "enterprise", "hyperscale")

ARCHITECTURE_LEVEL_BY_ID = {
    "monolith": "level_1_mvp",
    "modular_monolith": "level_3_enterprise",
    "clean_architecture": "level_3_enterprise",
    "hexagonal": "level_3_enterprise",
    "microservices": "level_4_distributed",
    "event_driven": "level_4_distributed",
    "cqrs": "level_4_distributed",
    "distributed_system": "level_5_hyperscale",
    "serverless": "level_2_professional",
}


def build_dependency_graph(selection: dict[str, Any]) -> dict[str, Any]:
    return generate_dependency_snapshot(selection)


def propagate_dependencies(selection: dict[str, Any]) -> dict[str, Any]:
    snapshot = generate_dependency_snapshot(selection)
    return snapshot["propagation"]


def calculate_impact(selection: dict[str, Any]) -> dict[str, Any]:
    snapshot = generate_dependency_snapshot(selection)
    return snapshot["impact_profile"]


def calculate_readiness(selection: dict[str, Any]) -> dict[str, Any]:
    snapshot = generate_dependency_snapshot(selection)
    return snapshot["readiness_profile"]


def calculate_risks(selection: dict[str, Any]) -> dict[str, Any]:
    snapshot = generate_dependency_snapshot(selection)
    return snapshot["risk_profile"]


def detect_conflicts(selection: dict[str, Any]) -> list[str]:
    snapshot = generate_dependency_snapshot(selection)
    return list(snapshot["propagation"]["conflicting_node_ids"])


def mutate_architecture(selection: dict[str, Any]) -> list[dict[str, Any]]:
    snapshot = generate_dependency_snapshot(selection)
    return list(snapshot["mutations"])


def generate_dependency_snapshot(selection: dict[str, Any]) -> dict[str, Any]:
    normalized = _normalize_selection(selection)
    language_id = normalized["language_id"]
    framework_id = normalized["framework_id"]
    architecture_id = normalized["architecture_id"]
    capability_ids = normalized["capability_ids"]
    infrastructure_ids = normalized["infrastructure_ids"]
    archetype_id = normalized.get("archetype_id")
    architecture_level = normalized.get("architecture_level") or ARCHITECTURE_LEVEL_BY_ID.get(architecture_id, "level_2_professional")

    rules = _collect_rules(language_id, framework_id, architecture_id, capability_ids, infrastructure_ids, archetype_id)
    propagation = _propagate(normalized, rules)
    mutations = list(propagation["mutations"])
    nodes = _build_nodes(normalized, propagation)
    edges = _build_edges(nodes, rules, propagation)
    impact = _calculate_impact_profile(normalized, propagation, rules)
    readiness = _calculate_readiness_profile(normalized, propagation, impact)
    risks = _calculate_risk_profile(normalized, propagation, impact, readiness)

    return {
        "graph_id": str(uuid4()),
        "language_id": language_id,
        "runtime_id": normalized["runtime_id"],
        "framework_id": framework_id,
        "architecture_id": architecture_id,
        "architecture_level": architecture_level,
        "archetype_id": archetype_id,
        "capability_ids": capability_ids,
        "infrastructure_ids": infrastructure_ids,
        "nodes": nodes,
        "edges": edges,
        "rules": rules,
        "propagation": propagation,
        "impact_profile": impact,
        "readiness_profile": readiness,
        "risk_profile": risks,
        "mutations": mutations,
        "generated_at": datetime.now(UTC).isoformat(),
        "contractVersion": CONTRACT_VERSION,
    }


def _normalize_selection(selection: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(selection)
    normalized["language_id"] = str(normalized.get("language_id") or "").strip()
    normalized["framework_id"] = str(normalized.get("framework_id") or "").strip()
    normalized["architecture_id"] = str(normalized.get("architecture_id") or "").strip()
    normalized["archetype_id"] = str(normalized.get("archetype_id") or "").strip() or None
    normalized["runtime_id"] = str(normalized.get("runtime_id") or _runtime_for_language(normalized["language_id"]))
    normalized["capability_ids"] = _unique_strings(normalized.get("capability_ids") or [])
    normalized["infrastructure_ids"] = _unique_strings(normalized.get("infrastructure_ids") or [])
    normalized["architecture_level"] = str(normalized.get("architecture_level") or "").strip()
    return normalized


def _runtime_for_language(language_id: str) -> str:
    return {
        "java": "jvm",
        "typescript": "nodejs",
        "javascript": "nodejs",
        "python": "python_runtime",
        "csharp": "aspnet_runtime",
        "php": "php_runtime",
        "go": "go_runtime",
    }.get(language_id, "unknown")


def _collect_rules(
    language_id: str,
    framework_id: str,
    architecture_id: str,
    capability_ids: list[str],
    infrastructure_ids: list[str],
    archetype_id: str | None,
) -> list[dict[str, Any]]:
    rules: list[dict[str, Any]] = []

    def add_rule(
        rule_id: str,
        label: str,
        trigger_node_ids: list[str],
        *,
        required_node_ids: list[str] | None = None,
        recommended_node_ids: list[str] | None = None,
        optional_node_ids: list[str] | None = None,
        blocked_node_ids: list[str] | None = None,
        conflicting_node_ids: list[str] | None = None,
        edge_type: str,
        rationale: str,
    ) -> None:
        rules.append(
            {
                "contractVersion": CONTRACT_VERSION,
                "id": rule_id,
                "label": label,
                "trigger_node_ids": trigger_node_ids,
                "required_node_ids": required_node_ids or [],
                "recommended_node_ids": recommended_node_ids or [],
                "optional_node_ids": optional_node_ids or [],
                "blocked_node_ids": blocked_node_ids or [],
                "conflicting_node_ids": conflicting_node_ids or [],
                "edge_type": edge_type,
                "rationale": rationale,
            }
        )

    if architecture_id == "microservices":
        add_rule(
            "microservices_rule",
            "Microservices propagation",
            ["microservices"],
            required_node_ids=["observability"],
            recommended_node_ids=["queue", "api_gateway", "docker", "docker_compose"],
            optional_node_ids=["kubernetes"],
            edge_type="requires",
            rationale="Microservices require observability and benefit from queue-backed async boundaries and an API gateway.",
        )
        add_rule(
            "microservices_scalability_rule",
            "Microservices scaling uplift",
            ["microservices"],
            recommended_node_ids=["redis"],
            optional_node_ids=["kubernetes"],
            edge_type="scales_with",
            rationale="Microservices scale better when cache and orchestration are present.",
        )

    if architecture_id == "monolith" and ("queue" in capability_ids or "kafka" in infrastructure_ids):
        add_rule(
            "monolith_distribution_conflict",
            "Monolith distribution conflict",
            ["monolith", "queue", "kafka"],
            conflicting_node_ids=["queue", "kafka"],
            edge_type="conflicts_with",
            rationale="A monolith conflicts with queue-heavy distribution concerns that are better handled by modular or distributed structures.",
        )

    if "ai_chat" in capability_ids:
        add_rule(
            "ai_chat_rule",
            "AI chat propagation",
            ["ai_chat"],
            required_node_ids=["rate_limiting"],
            recommended_node_ids=["websocket", "vector_database", "observability"],
            blocked_node_ids=["public_unthrottled_ai"],
            edge_type="requires",
            rationale="AI chat endpoints need rate limiting, telemetry, and often websocket or vector-backed support.",
        )

    if "rag" in capability_ids:
        add_rule(
            "rag_rule",
            "RAG propagation",
            ["rag"],
            required_node_ids=["vector_database"],
            recommended_node_ids=["queue", "cache", "observability"],
            edge_type="requires",
            rationale="RAG systems require a vector store and benefit from queueing, cache, and telemetry.",
        )

    if "payments" in capability_ids:
        add_rule(
            "payments_rule",
            "Payments propagation",
            ["payments"],
            recommended_node_ids=["audit_logs", "observability"],
            required_node_ids=["security"],
            edge_type="requires",
            rationale="Payments increase the security surface and require traceability through audit logs and observability.",
        )

    if framework_id == "spring_boot":
        add_rule(
            "spring_boot_rule",
            "Spring Boot enterprise preference",
            ["spring_boot"],
            recommended_node_ids=["modular_monolith", "observability"],
            optional_node_ids=["microservices"],
            edge_type="reduces_complexity",
            rationale="Spring Boot benefits from a modular monolith before microservices and favors enterprise observability patterns.",
        )

    if framework_id == "nextjs":
        add_rule(
            "nextjs_rule",
            "Next.js delivery preference",
            ["nextjs"],
            recommended_node_ids=["seo", "analytics", "edge_deployment", "vercel"],
            optional_node_ids=["nextauth", "clerk"],
            edge_type="enables",
            rationale="Next.js is optimized for SEO, analytics, and edge delivery with managed auth options.",
        )

    if framework_id == "fastapi":
        add_rule(
            "fastapi_rule",
            "FastAPI async and AI readiness",
            ["fastapi"],
            recommended_node_ids=["async_jobs", "observability"],
            optional_node_ids=["ai", "queue"],
            edge_type="enables",
            rationale="FastAPI favors async jobs and observability and is a strong fit for AI workloads.",
        )

    if framework_id in {"nestjs", "react", "angular", "nextjs"}:
        add_rule(
            "enterprise_auth_rule",
            "Enterprise auth baseline",
            [framework_id],
            recommended_node_ids=["auth_provider"],
            optional_node_ids=["rbac"],
            edge_type="optional_with",
            rationale="Enterprise web stacks benefit from an explicit identity provider baseline.",
        )

    if "authentication" in capability_ids or "rbac" in capability_ids:
        add_rule(
            "security_auth_rule",
            "Security baseline propagation",
            ["authentication", "rbac"],
            recommended_node_ids=["observability"],
            edge_type="enables",
            rationale="Authentication and RBAC should be paired with auditability and operational telemetry.",
        )

    if archetype_id in {"ai_saas", "rag_system", "automation_agent", "ai_agent_platform"}:
        add_rule(
            "ai_archetype_rule",
            "AI workload mutation",
            [archetype_id],
            required_node_ids=["observability"],
            recommended_node_ids=["rate_limiting", "vector_database", "cache", "queue"],
            edge_type="requires",
            rationale="AI-oriented archetypes mutate the baseline toward vector stores, throttling and telemetry.",
        )

    if infrastructure_ids:
        add_rule(
            "infrastructure_alignment_rule",
            "Infrastructure alignment",
            infrastructure_ids,
            recommended_node_ids=["observability"],
            edge_type="optional_with",
            rationale="Existing foundation components should stay aligned with telemetry and operational visibility.",
        )

    return rules


def _propagate(selection: dict[str, Any], rules: list[dict[str, Any]]) -> dict[str, Any]:
    capability_ids = set(selection["capability_ids"])
    infrastructure_ids = set(selection["infrastructure_ids"])
    framework_id = selection["framework_id"]
    architecture_id = selection["architecture_id"]
    archetype_id = selection.get("archetype_id")

    required = set()
    recommended = set()
    optional = set()
    blocked = set()
    conflicts = set()
    warnings: list[str] = []
    rationale: list[str] = []
    mutations: list[dict[str, Any]] = []

    for rule in rules:
        trigger_ids = set(rule["trigger_node_ids"])
        active = False
        if trigger_ids:
            active = bool(trigger_ids & capability_ids) or bool(trigger_ids & infrastructure_ids)
            active = active or framework_id in trigger_ids or architecture_id in trigger_ids or (archetype_id and archetype_id in trigger_ids)
        if not active:
            continue

        required.update(rule["required_node_ids"])
        recommended.update(rule["recommended_node_ids"])
        optional.update(rule["optional_node_ids"])
        blocked.update(rule["blocked_node_ids"])
        conflicts.update(rule["conflicting_node_ids"])
        rationale.append(rule["rationale"])

        if rule["id"] == "microservices_rule":
            mutations.extend(
                [
                    _mutation("microservices", "deployment", "warning", "deployment complexity stays controlled", "deployment complexity rises", "Microservices increase deployment coordination and operational burden.", ["observability", "api_gateway"], True),
                    _mutation("microservices", "scalability", "info", "scalability remains bounded", "scalability expands", "Microservices improve scaling flexibility when observability is present.", ["queue"], False),
                ]
            )
        if rule["id"] == "ai_chat_rule":
            mutations.extend(
                [
                    _mutation("ai_chat", "security", "critical", "unthrottled", "rate-limited", "AI chat requires request throttling and token tracking.", ["rate_limiting", "observability"], True),
                    _mutation("ai_chat", "infrastructure", "warning", "general store", "vector-backed store", "AI chat mutates infrastructure toward vector search support.", ["vector_database"], True),
                ]
            )
        if rule["id"] == "rag_rule":
            mutations.extend(
                [
                    _mutation("rag", "infrastructure", "critical", "no vector layer", "vector database required", "RAG requires a vector database to resolve retrieval.", ["vector_database"], True),
                    _mutation("rag", "deployment", "warning", "single-path delivery", "queued retrieval", "RAG benefits from queueing and cache to shape operational load.", ["queue", "cache"], False),
                ]
            )
        if rule["id"] == "payments_rule":
            mutations.append(
                _mutation("payments", "security", "warning", "transactional baseline", "audited transactional baseline", "Payments raise the security and audit burden.", ["audit_logs", "observability"], True)
            )
        if rule["id"] == "spring_boot_rule":
            mutations.append(
                _mutation("spring_boot", "architecture", "info", "framework-first", "modular-monolith preferred", "Spring Boot favors a modular monolith before microservices.", ["modular_monolith", "microservices"], False)
            )
        if rule["id"] == "nextjs_rule":
            mutations.append(
                _mutation("nextjs", "deployment", "info", "general deployment", "edge and vercel optimized", "Next.js mutates toward edge-first delivery and SEO visibility.", ["edge_deployment", "vercel", "seo"], False)
            )
        if rule["id"] == "fastapi_rule":
            mutations.append(
                _mutation("fastapi", "architecture", "info", "sync-heavy API", "async-ready API", "FastAPI mutates the runtime toward async jobs and observability.", ["async_jobs", "observability"], False)
            )

    if architecture_id == "microservices":
        if "observability" not in capability_ids and "observability" not in infrastructure_ids:
            warnings.append("Microservices requires observability to remain operationally safe.")
            required.add("observability")
        if "docker" not in infrastructure_ids and "docker_compose" not in infrastructure_ids:
            required.add("docker")
        recommended.update({"queue", "api_gateway"})
    if "ai_chat" in capability_ids:
        required.add("rate_limiting")
        recommended.update({"vector_database", "observability"})
    if "rag" in capability_ids:
        required.add("vector_database")
        recommended.update({"queue", "cache"})
    if "payments" in capability_ids:
        recommended.update({"audit_logs", "observability"})
    if framework_id == "spring_boot":
        recommended.add("modular_monolith")
    if framework_id == "nextjs":
        recommended.update({"seo", "analytics", "edge_deployment"})
    if framework_id == "fastapi":
        recommended.update({"async_jobs", "observability"})

    if "observability" in required and "observability" not in capability_ids and "observability" not in infrastructure_ids:
        warnings.append("Observability was propagated as a required dependency.")
    if "rate_limiting" in required and "rate_limiting" not in capability_ids:
        warnings.append("AI traffic requires rate limiting.")
    if "vector_database" in required and "vector_database" not in infrastructure_ids:
        warnings.append("Vector database support is required for AI retrieval workloads.")
    if conflicts:
        warnings.append("Unsupported architecture conflict detected.")

    return {
        "activated_node_ids": _unique_strings([selection["language_id"], selection["runtime_id"], framework_id, architecture_id, *selection["capability_ids"], *selection["infrastructure_ids"], *( [archetype_id] if archetype_id else [] )]),
        "required_node_ids": _sorted(required),
        "recommended_node_ids": _sorted(recommended),
        "optional_node_ids": _sorted(optional),
        "blocked_node_ids": _sorted(blocked),
        "conflicting_node_ids": _sorted(conflicts),
        "warnings": _unique_strings(warnings),
        "rationale": _unique_strings(rationale),
        "mutations": mutations,
        "contractVersion": CONTRACT_VERSION,
    }


def _build_nodes(selection: dict[str, Any], propagation: dict[str, Any]) -> list[dict[str, Any]]:
    ids = _unique_strings([
        selection["language_id"],
        selection["runtime_id"],
        selection["framework_id"],
        selection["architecture_id"],
        *selection["capability_ids"],
        *selection["infrastructure_ids"],
        *propagation["required_node_ids"],
        *propagation["recommended_node_ids"],
        *propagation["optional_node_ids"],
    ])
    return [_node_for(item_id) for item_id in ids]


def _build_edges(nodes: list[dict[str, Any]], rules: list[dict[str, Any]], propagation: dict[str, Any]) -> list[dict[str, Any]]:
    node_ids = {node["id"] for node in nodes}
    edges: list[dict[str, Any]] = []

    for rule in rules:
        for trigger in rule["trigger_node_ids"]:
            if trigger not in node_ids:
                continue
            for target in rule["required_node_ids"]:
                edges.append(_edge(trigger, target, rule["edge_type"], "requires"))
            for target in rule["recommended_node_ids"]:
                edges.append(_edge(trigger, target, "recommends", "recommendation"))
            for target in rule["optional_node_ids"]:
                edges.append(_edge(trigger, target, "optional_with", "optional fit"))
            for target in rule["blocked_node_ids"]:
                edges.append(_edge(trigger, target, "blocks", "blocked path"))
            for target in rule["conflicting_node_ids"]:
                edges.append(_edge(trigger, target, "conflicts_with", "conflict"))

    # Always connect the technology spine for visual grounding.
    spine = [node_id for node_id in ("language", "runtime", "framework", "architecture")]
    selection_spine = [node["id"] for node in nodes if node["id"] in node_ids and node["type"] in {"language", "runtime", "framework", "architecture"}]
    if len(selection_spine) == 4:
        edges.extend(
            [
                _edge(selection_spine[0], selection_spine[1], "enables", "language enables runtime"),
                _edge(selection_spine[1], selection_spine[2], "enables", "runtime enables framework"),
                _edge(selection_spine[2], selection_spine[3], "enables", "framework shapes architecture"),
            ]
        )

    # Remove duplicates.
    seen: set[tuple[str, str, str]] = set()
    deduped: list[dict[str, Any]] = []
    for edge in edges:
        signature = (edge["source_id"], edge["target_id"], edge["type"])
        if signature in seen:
            continue
        seen.add(signature)
        deduped.append(edge)
    return deduped


def _calculate_impact_profile(selection: dict[str, Any], propagation: dict[str, Any], rules: list[dict[str, Any]]) -> dict[str, Any]:
    architecture_id = selection["architecture_id"]
    capability_ids = set(selection["capability_ids"])
    infrastructure_ids = set(selection["infrastructure_ids"])
    trigger_count = len(capability_ids) + len(infrastructure_ids)

    base_scores = {
        "monolith": 18,
        "modular_monolith": 38,
        "clean_architecture": 42,
        "hexagonal": 42,
        "microservices": 72,
        "event_driven": 66,
        "cqrs": 68,
        "distributed_system": 84,
        "serverless": 56,
    }
    score = base_scores.get(architecture_id, 24)

    if architecture_id == "microservices":
        score += 14
    if "ai_chat" in capability_ids:
        score += 12
    if "rag" in capability_ids:
        score += 16
    if "payments" in capability_ids:
        score += 8
    if "observability" in capability_ids or "observability" in infrastructure_ids:
        score -= 6
    if "rate_limiting" in capability_ids:
        score -= 4
    score += min(trigger_count * 2, 18)
    score = max(8, min(100, score))

    return {
        "score": score,
        "infra_complexity": _band(score + _mutation_pressure(propagation, "infrastructure")),
        "deployment_complexity": _band(score + _mutation_pressure(propagation, "deployment")),
        "operational_burden": _band(score + 8),
        "scaling_complexity": _band(score + (12 if architecture_id == "microservices" else 4)),
        "maintenance_cost": _band(score + 6 + len(propagation["warnings"]) * 2),
        "security_surface": _band(score + (12 if "payments" in capability_ids else 4) + (8 if "ai_chat" in capability_ids else 0)),
        "learning_curve": _band(score + (8 if architecture_id in {"microservices", "cqrs", "distributed_system"} else 0)),
        "team_maturity_required": _band(score + (10 if architecture_id == "microservices" else 2)),
        "rationale": _unique_strings(
            [
                "Impact reflects the selected architecture, capabilities and propagated dependencies.",
                *propagation["rationale"],
            ]
        ),
        "contractVersion": CONTRACT_VERSION,
    }


def _calculate_readiness_profile(selection: dict[str, Any], propagation: dict[str, Any], impact: dict[str, Any]) -> dict[str, Any]:
    required = set(propagation["required_node_ids"])
    selected_capabilities = set(selection["capability_ids"])
    selected_infra = set(selection["infrastructure_ids"])
    blockers: list[str] = []
    warnings: list[str] = []
    missing_requirements: list[str] = []
    suggestions: list[str] = []

    def missing(node_id: str) -> bool:
        return node_id not in selected_capabilities and node_id not in selected_infra

    if "observability" in required and missing("observability"):
        blockers.append("Observability is required for the current architecture selection.")
        missing_requirements.append("observability")
        suggestions.append("Add observability before moving toward distributed delivery.")
    if "rate_limiting" in required and missing("rate_limiting"):
        blockers.append("Rate limiting is required for AI chat and similar exposed AI surfaces.")
        missing_requirements.append("rate_limiting")
        suggestions.append("Add rate limiting to protect AI-driven routes.")
    if "vector_database" in required and missing("vector_database"):
        blockers.append("Vector database support is required for the current AI or RAG workload.")
        missing_requirements.append("vector_database")
        suggestions.append("Add a vector database or retire the retrieval workload.")
    if selection["architecture_id"] == "microservices" and not any(item in selected_infra or item in selected_capabilities for item in {"docker", "docker_compose", "kubernetes"}):
        blockers.append("Microservices requires a containerized deployment baseline.")
        missing_requirements.append("docker")
        suggestions.append("Add docker or docker compose before splitting the architecture.")
    if "payments" in selected_capabilities and "audit_logs" not in selected_capabilities:
        warnings.append("Payments should be paired with audit logs for traceability.")
        suggestions.append("Add audit logs for payment flows.")
    if "ai_chat" in selected_capabilities and "observability" not in selected_capabilities and "observability" not in selected_infra:
        warnings.append("AI chat should be paired with observability for latency and prompt tracing.")
    if "rag" in selected_capabilities and "queue" not in selected_capabilities and "queue" not in selected_infra:
        warnings.append("RAG usually benefits from queueing to isolate retrieval pressure.")

    base = 88
    penalty = len(missing_requirements) * 18 + len(blockers) * 8 + len(warnings) * 3
    score = max(0, min(100, base - penalty))
    readiness = {
        "mvp_readiness": max(0, min(100, score + 4)),
        "production_readiness": max(0, min(100, score - len(blockers) * 4)),
        "enterprise_readiness": max(0, min(100, score - len(blockers) * 6 - (10 if selection["architecture_id"] == "microservices" else 0))),
        "scalability_readiness": max(0, min(100, score + (10 if selection["architecture_id"] in {"microservices", "event_driven", "distributed_system"} else 0))),
        "observability_readiness": 100 if "observability" in selected_capabilities or "observability" in selected_infra else max(0, score - 28),
        "security_readiness": max(0, min(100, score - (15 if "payments" in selected_capabilities else 0) - (8 if "ai_chat" in selected_capabilities else 0))),
    }
    readiness_score = round(sum(readiness.values()) / len(readiness))
    return {
        "score": readiness_score,
        **readiness,
        "missing_requirements": _unique_strings(missing_requirements),
        "blockers": _unique_strings(blockers),
        "warnings": _unique_strings(warnings),
        "suggestions": _unique_strings(suggestions or ["The current dependency set is structurally ready."]),
        "contractVersion": CONTRACT_VERSION,
    }


def _calculate_risk_profile(selection: dict[str, Any], propagation: dict[str, Any], impact: dict[str, Any], readiness: dict[str, Any]) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    blockers = list(readiness["blockers"])
    warnings = list(readiness["warnings"])
    capability_ids = set(selection["capability_ids"])
    infrastructure_ids = set(selection["infrastructure_ids"])
    architecture_id = selection["architecture_id"]

    def issue(issue_id: str, title: str, severity: str, summary: str, related: list[str]) -> None:
        issues.append(
            {
                "contractVersion": CONTRACT_VERSION,
                "id": issue_id,
                "title": title,
                "severity": severity,
                "summary": summary,
                "related_node_ids": _unique_strings(related),
            }
        )

    if architecture_id == "microservices" and "observability" not in capability_ids and "observability" not in infrastructure_ids:
        issue(
            "missing_observability",
            "Missing observability",
            "critical",
            "Microservices without observability creates an unsafe operational blind spot.",
            ["microservices", "observability"],
        )
    if "ai_chat" in capability_ids and "rate_limiting" not in capability_ids:
        issue(
            "missing_rate_limiting",
            "Missing rate limiting",
            "critical",
            "AI chat should not be exposed without request throttling.",
            ["ai_chat", "rate_limiting"],
        )
    if "rag" in capability_ids and "vector_database" not in infrastructure_ids:
        issue(
            "missing_vector_database",
            "Missing vector database",
            "critical",
            "RAG requires a vector database for retrieval.",
            ["rag", "vector_database"],
        )
    if "payments" in capability_ids and "audit_logs" not in capability_ids:
        issue(
            "weak_security_baseline",
            "Weak security baseline",
            "warning",
            "Payments should include audit logs for traceability.",
            ["payments", "audit_logs"],
        )
    if architecture_id == "microservices" and len(capability_ids) <= 2:
        issue(
            "overengineering",
            "Potential overengineering",
            "warning",
            "Microservices may be oversized for the current scope.",
            ["microservices"],
        )
    if architecture_id == "monolith" and ("queue" in capability_ids or "kafka" in infrastructure_ids):
        issue(
            "scalability_mismatch",
            "Scalability mismatch",
            "info",
            "Queue-oriented concerns suggest a more modular or distributed foundation.",
            ["monolith", "queue"],
        )
    if selection["architecture_id"] in {"microservices", "distributed_system"} and not any(item in infrastructure_ids for item in {"docker", "docker_compose", "kubernetes"}):
        issue(
            "deployment_mismatch",
            "Deployment mismatch",
            "critical",
            "Distributed architectures require an explicit container or orchestration baseline.",
            [selection["architecture_id"], "docker"],
        )
    if architecture_id in {"microservices", "event_driven", "distributed_system", "cqrs"} and len(propagation["recommended_node_ids"]) > 4 and len(infrastructure_ids) < 2:
        issue(
            "excessive_complexity",
            "Excessive complexity",
            "warning",
            "The current selection is growing faster than the infrastructure foundation.",
            [selection["architecture_id"]],
        )

    if not any(item["severity"] == "critical" for item in issues):
        blockers = [item for item in blockers if item]
    else:
        blockers.extend(item["summary"] for item in issues if item["severity"] == "critical")

    score = max(0, min(100, 100 - len([item for item in issues if item["severity"] == "critical"]) * 18 - len([item for item in issues if item["severity"] == "warning"]) * 8))
    risk_level = _band(score)
    if any(item["severity"] == "critical" for item in issues):
        risk_level = "high" if score >= 65 else "enterprise" if score >= 45 else "hyperscale"
    rationale = _unique_strings([issue["summary"] for issue in issues] + propagation["warnings"])

    return {
        "score": score,
        "risk_level": risk_level,
        "issues": issues,
        "blockers": _unique_strings(blockers),
        "warnings": _unique_strings(warnings + [issue["summary"] for issue in issues if issue["severity"] == "warning"]),
        "rationale": rationale,
        "contractVersion": CONTRACT_VERSION,
    }


def _mutation(
    trigger_node_id: str,
    category: str,
    severity: str,
    source_value: str,
    mutated_value: str,
    rationale: str,
    related_node_ids: list[str],
    required_review: bool,
) -> dict[str, Any]:
    return {
        "contractVersion": CONTRACT_VERSION,
        "id": f"mutation_{trigger_node_id}_{category}",
        "trigger_node_id": trigger_node_id,
        "category": category,
        "severity": severity,
        "source_value": source_value,
        "mutated_value": mutated_value,
        "rationale": rationale,
        "related_node_ids": _unique_strings(related_node_ids),
        "required_review": required_review,
    }


def _node_for(node_id: str) -> dict[str, Any]:
    node = NODE_CATALOG.get(node_id)
    if node is not None:
        return {"contractVersion": CONTRACT_VERSION, **node}

    if node_id in LANGUAGE_IDS:
        return _generic_node(node_id, "language", "language", node_id.replace("_", " "), "Language dependency node", 4, 3)
    if node_id in RUNTIME_IDS:
        return _generic_node(node_id, "runtime", "runtime", node_id.replace("_", " "), "Runtime dependency node", 4, 3)
    if node_id in FRAMEWORK_IDS:
        return _generic_node(node_id, "framework", "framework", node_id.replace("_", " "), "Framework dependency node", 5, 4)
    if node_id in ARCHITECTURE_IDS:
        return _generic_node(node_id, "architecture", "architecture", node_id.replace("_", " "), "Architecture dependency node", 6, 6)
    if node_id in CAPABILITY_IDS:
        return _generic_node(node_id, "capability", "capability", node_id.replace("_", " "), "Capability dependency node", 5, 5)
    if node_id in INFRASTRUCTURE_IDS:
        return _generic_node(node_id, "infrastructure", "infrastructure", node_id.replace("_", " "), "Infrastructure dependency node", 6, 6)
    return _generic_node(node_id, "data", "data", node_id.replace("_", " "), "Generic dependency node", 3, 3)


def _generic_node(node_id: str, node_type: str, category: str, label: str, description: str, severity_weight: int, complexity_weight: int) -> dict[str, Any]:
    return {
        "contractVersion": CONTRACT_VERSION,
        "id": node_id,
        "type": node_type,
        "category": category,
        "label": label,
        "description": description,
        "severity_weight": severity_weight,
        "complexity_weight": complexity_weight,
    }


def _edge(source_id: str, target_id: str, edge_type: str, label: str) -> dict[str, Any]:
    return {
        "contractVersion": CONTRACT_VERSION,
        "id": f"{source_id}->{target_id}:{edge_type}",
        "source_id": source_id,
        "target_id": target_id,
        "type": edge_type,
        "label": label,
        "description": f"{source_id} {edge_type.replace('_', ' ')} {target_id}",
        "weight": 1,
    }


def _band(score: int) -> str:
    if score >= 90:
        return "hyperscale"
    if score >= 74:
        return "enterprise"
    if score >= 55:
        return "high"
    if score >= 32:
        return "medium"
    return "low"


def _mutation_pressure(propagation: dict[str, Any], category: str) -> int:
    pressure = 0
    for mutation in propagation["mutations"]:
        if mutation["category"] == category:
            pressure += 10 if mutation["severity"] == "critical" else 6 if mutation["severity"] == "warning" else 3
    return pressure


def _unique_strings(values: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(item for item in values if item))


def _sorted(values: Iterable[str]) -> list[str]:
    return sorted(dict.fromkeys(item for item in values if item))


LANGUAGE_IDS = {"java", "typescript", "javascript", "python", "csharp", "php", "go"}
RUNTIME_IDS = {"jvm", "nodejs", "python_runtime", "aspnet_runtime", "php_runtime", "go_runtime"}
FRAMEWORK_IDS = {"spring_boot", "nestjs", "nextjs", "express", "react", "angular", "fastapi", "django", "aspnet_core", "laravel", "gin", "fiber"}
ARCHITECTURE_IDS = {"monolith", "modular_monolith", "clean_architecture", "hexagonal", "microservices", "event_driven", "cqrs", "distributed_system", "serverless"}
CAPABILITY_IDS = {
    "authentication",
    "rbac",
    "observability",
    "queue",
    "cache",
    "payments",
    "rate_limiting",
    "ai_chat",
    "rag",
    "websocket",
    "seo",
    "analytics",
    "edge_deployment",
    "async_jobs",
    "audit_logs",
    "token_tracking",
    "docker",
    "api_gateway",
    "vector_database",
    "email_notifications",
    "pwa",
    "i18n",
    "search",
    "sentry",
}
INFRASTRUCTURE_IDS = {
    "sqlite",
    "postgresql",
    "mysql",
    "mongodb",
    "redis",
    "rabbitmq",
    "kafka",
    "sqs",
    "local_storage",
    "s3",
    "cloudflare_r2",
    "jwt",
    "keycloak",
    "auth0",
    "clerk",
    "nextauth",
    "prometheus",
    "grafana",
    "opentelemetry",
    "sentry",
    "local",
    "docker",
    "docker_compose",
    "kubernetes",
    "vercel",
    "railway",
    "flyio",
    "nginx",
    "spring_cloud_gateway",
    "kong",
    "traefik",
    "postgres_full_text",
    "elasticsearch",
    "meilisearch",
    "pgvector",
    "qdrant",
    "pinecone",
    "smtp",
    "resend",
    "sendgrid",
    "stripe",
    "mercado_pago",
}

NODE_CATALOG: dict[str, dict[str, Any]] = {
    "java": _generic_node("java", "language", "language", "Java", "Enterprise JVM language", 5, 5),
    "typescript": _generic_node("typescript", "language", "language", "TypeScript", "Typed JavaScript language", 4, 4),
    "python": _generic_node("python", "language", "language", "Python", "Python language for services and AI", 4, 4),
    "csharp": _generic_node("csharp", "language", "language", "C#", "Microsoft enterprise language", 4, 4),
    "php": _generic_node("php", "language", "language", "PHP", "PHP language for web backends", 3, 3),
    "go": _generic_node("go", "language", "language", "Go", "Concurrent systems language", 4, 4),
    "jvm": _generic_node("jvm", "runtime", "runtime", "JVM", "Java Virtual Machine runtime", 5, 5),
    "nodejs": _generic_node("nodejs", "runtime", "runtime", "Node.js", "Event-loop JavaScript runtime", 4, 4),
    "python_runtime": _generic_node("python_runtime", "runtime", "runtime", "Python runtime", "Python execution environment", 4, 4),
    "aspnet_runtime": _generic_node("aspnet_runtime", "runtime", "runtime", ".NET runtime", "ASP.NET Core runtime", 4, 4),
    "php_runtime": _generic_node("php_runtime", "runtime", "runtime", "PHP runtime", "PHP execution environment", 3, 3),
    "go_runtime": _generic_node("go_runtime", "runtime", "runtime", "Go runtime", "Go execution environment", 4, 4),
    "spring_boot": _generic_node("spring_boot", "framework", "framework", "Spring Boot", "Java enterprise application framework", 6, 6),
    "nestjs": _generic_node("nestjs", "framework", "framework", "NestJS", "TypeScript enterprise backend framework", 5, 5),
    "nextjs": _generic_node("nextjs", "framework", "framework", "Next.js", "React full-stack web framework", 4, 4),
    "express": _generic_node("express", "framework", "framework", "Express", "Minimal Node.js web framework", 4, 4),
    "react": _generic_node("react", "framework", "framework", "React", "Frontend UI framework", 3, 3),
    "angular": _generic_node("angular", "framework", "framework", "Angular", "Structured frontend framework", 4, 4),
    "fastapi": _generic_node("fastapi", "framework", "framework", "FastAPI", "Python API framework", 5, 5),
    "django": _generic_node("django", "framework", "framework", "Django", "Python web framework", 5, 5),
    "aspnet_core": _generic_node("aspnet_core", "framework", "framework", "ASP.NET Core", "C# backend framework", 5, 5),
    "laravel": _generic_node("laravel", "framework", "framework", "Laravel", "PHP web framework", 4, 4),
    "gin": _generic_node("gin", "framework", "framework", "Gin", "Go web framework", 4, 4),
    "fiber": _generic_node("fiber", "framework", "framework", "Fiber", "Go web framework", 4, 4),
    "monolith": _generic_node("monolith", "architecture", "architecture", "Monolith", "Single deployable architecture", 3, 3),
    "modular_monolith": _generic_node("modular_monolith", "architecture", "architecture", "Modular Monolith", "Single deployable with strong module boundaries", 4, 4),
    "clean_architecture": _generic_node("clean_architecture", "architecture", "architecture", "Clean Architecture", "Boundary-driven architecture", 5, 5),
    "hexagonal": _generic_node("hexagonal", "architecture", "architecture", "Hexagonal Architecture", "Ports and adapters architecture", 5, 5),
    "microservices": _generic_node("microservices", "architecture", "architecture", "Microservices", "Distributed services architecture", 8, 8),
    "event_driven": _generic_node("event_driven", "architecture", "architecture", "Event Driven", "Event-based distributed architecture", 7, 7),
    "cqrs": _generic_node("cqrs", "architecture", "architecture", "CQRS", "Segregated read/write architecture", 7, 7),
    "distributed_system": _generic_node("distributed_system", "architecture", "architecture", "Distributed System", "Distributed systems architecture", 9, 9),
    "serverless": _generic_node("serverless", "architecture", "architecture", "Serverless", "Managed function architecture", 5, 5),
    "authentication": _generic_node("authentication", "capability", "security", "Authentication", "Identity and login flows", 5, 4),
    "rbac": _generic_node("rbac", "capability", "security", "RBAC", "Role-based access control", 5, 4),
    "observability": _generic_node("observability", "capability", "observability", "Observability", "Logs, metrics and tracing", 6, 5),
    "queue": _generic_node("queue", "capability", "data", "Queue", "Asynchronous task queueing", 5, 5),
    "cache": _generic_node("cache", "capability", "data", "Cache", "Caching and session acceleration", 4, 4),
    "payments": _generic_node("payments", "capability", "security", "Payments", "Billing and payment processing", 6, 5),
    "rate_limiting": _generic_node("rate_limiting", "capability", "security", "Rate Limiting", "Request throttling and abuse protection", 5, 4),
    "ai_chat": _generic_node("ai_chat", "capability", "ai", "AI Chat", "Conversational AI surface", 7, 7),
    "rag": _generic_node("rag", "capability", "ai", "RAG", "Retrieval-augmented generation", 8, 8),
    "websocket": _generic_node("websocket", "capability", "deployment", "WebSocket", "Realtime communication", 4, 4),
    "seo": _generic_node("seo", "capability", "deployment", "SEO", "Search optimisation", 2, 2),
    "analytics": _generic_node("analytics", "capability", "data", "Analytics", "Metrics and reporting", 3, 3),
    "edge_deployment": _generic_node("edge_deployment", "deployment", "deployment", "Edge Deployment", "Edge runtime deployment", 4, 5),
    "async_jobs": _generic_node("async_jobs", "capability", "deployment", "Async Jobs", "Background jobs and workers", 4, 5),
    "audit_logs": _generic_node("audit_logs", "capability", "security", "Audit Logs", "Traceability and audit trail", 4, 3),
    "token_tracking": _generic_node("token_tracking", "capability", "security", "Token Tracking", "Token usage and accounting", 4, 3),
    "docker": _generic_node("docker", "infrastructure", "deployment", "Docker", "Container packaging", 4, 5),
    "api_gateway": _generic_node("api_gateway", "infrastructure", "deployment", "API Gateway", "Gateway layer for service routing", 5, 6),
    "vector_database": _generic_node("vector_database", "infrastructure", "data", "Vector Database", "Embedding-backed retrieval store", 6, 7),
    "email_notifications": _generic_node("email_notifications", "capability", "deployment", "Email Notifications", "Transactional email delivery", 2, 2),
    "pwa": _generic_node("pwa", "capability", "deployment", "PWA", "Progressive web app", 2, 2),
    "i18n": _generic_node("i18n", "capability", "deployment", "i18n", "Internationalisation", 2, 2),
    "search": _generic_node("search", "capability", "data", "Search", "Search and indexing", 3, 4),
    "sentry": _generic_node("sentry", "infrastructure", "observability", "Sentry", "Error monitoring platform", 4, 4),
    "postgresql": _generic_node("postgresql", "infrastructure", "data", "PostgreSQL", "Relational database", 5, 5),
    "mysql": _generic_node("mysql", "infrastructure", "data", "MySQL", "Relational database", 4, 4),
    "mongodb": _generic_node("mongodb", "infrastructure", "data", "MongoDB", "Document database", 4, 4),
    "sqlite": _generic_node("sqlite", "infrastructure", "data", "SQLite", "Embedded database", 2, 2),
    "redis": _generic_node("redis", "infrastructure", "data", "Redis", "In-memory store", 5, 5),
    "rabbitmq": _generic_node("rabbitmq", "infrastructure", "deployment", "RabbitMQ", "Message broker", 5, 6),
    "kafka": _generic_node("kafka", "infrastructure", "deployment", "Kafka", "Streaming platform", 6, 7),
    "sqs": _generic_node("sqs", "infrastructure", "deployment", "SQS", "Managed queue", 5, 5),
    "local_storage": _generic_node("local_storage", "infrastructure", "deployment", "Local Storage", "Filesystem storage", 1, 1),
    "s3": _generic_node("s3", "infrastructure", "deployment", "S3", "Object storage", 4, 4),
    "cloudflare_r2": _generic_node("cloudflare_r2", "infrastructure", "deployment", "Cloudflare R2", "Edge-friendly object storage", 4, 4),
    "jwt": _generic_node("jwt", "infrastructure", "security", "JWT", "Token auth baseline", 3, 2),
    "keycloak": _generic_node("keycloak", "infrastructure", "security", "Keycloak", "Self-hosted IAM", 5, 5),
    "auth0": _generic_node("auth0", "infrastructure", "security", "Auth0", "Managed IAM", 5, 4),
    "clerk": _generic_node("clerk", "infrastructure", "security", "Clerk", "Frontend-friendly auth", 4, 4),
    "nextauth": _generic_node("nextauth", "infrastructure", "security", "NextAuth", "Next.js auth library", 4, 4),
    "prometheus": _generic_node("prometheus", "infrastructure", "observability", "Prometheus", "Metrics and alerting", 5, 5),
    "grafana": _generic_node("grafana", "infrastructure", "observability", "Grafana", "Operational dashboards", 4, 4),
    "opentelemetry": _generic_node("opentelemetry", "infrastructure", "observability", "OpenTelemetry", "Tracing and telemetry", 5, 5),
    "local": _generic_node("local", "deployment", "deployment", "Local", "Local deployment", 1, 1),
    "docker_compose": _generic_node("docker_compose", "deployment", "deployment", "Docker Compose", "Local container orchestration", 3, 4),
    "kubernetes": _generic_node("kubernetes", "deployment", "deployment", "Kubernetes", "Cluster orchestration", 7, 8),
    "vercel": _generic_node("vercel", "deployment", "deployment", "Vercel", "Frontend deployment platform", 3, 3),
    "railway": _generic_node("railway", "deployment", "deployment", "Railway", "Managed deployment platform", 3, 3),
    "flyio": _generic_node("flyio", "deployment", "deployment", "Fly.io", "Edge deployment platform", 3, 3),
    "nginx": _generic_node("nginx", "infrastructure", "deployment", "Nginx", "Reverse proxy and gateway", 3, 3),
    "spring_cloud_gateway": _generic_node("spring_cloud_gateway", "infrastructure", "deployment", "Spring Cloud Gateway", "Java gateway", 5, 6),
    "kong": _generic_node("kong", "infrastructure", "deployment", "Kong", "API gateway", 5, 6),
    "traefik": _generic_node("traefik", "infrastructure", "deployment", "Traefik", "Dynamic gateway", 4, 5),
    "postgres_full_text": _generic_node("postgres_full_text", "infrastructure", "data", "Postgres Full Text", "Postgres search layer", 3, 3),
    "elasticsearch": _generic_node("elasticsearch", "infrastructure", "data", "Elasticsearch", "Search engine", 5, 6),
    "meilisearch": _generic_node("meilisearch", "infrastructure", "data", "Meilisearch", "Lightweight search engine", 3, 4),
    "pgvector": _generic_node("pgvector", "infrastructure", "data", "pgvector", "Vector extension for PostgreSQL", 4, 5),
    "qdrant": _generic_node("qdrant", "infrastructure", "data", "Qdrant", "Vector database", 5, 6),
    "pinecone": _generic_node("pinecone", "infrastructure", "data", "Pinecone", "Managed vector database", 5, 5),
    "smtp": _generic_node("smtp", "infrastructure", "deployment", "SMTP", "Email delivery", 2, 2),
    "resend": _generic_node("resend", "infrastructure", "deployment", "Resend", "Managed email provider", 2, 2),
    "sendgrid": _generic_node("sendgrid", "infrastructure", "deployment", "SendGrid", "Managed email provider", 2, 2),
    "stripe": _generic_node("stripe", "infrastructure", "security", "Stripe", "Payments provider", 4, 4),
    "mercado_pago": _generic_node("mercado_pago", "infrastructure", "security", "Mercado Pago", "Payments provider", 4, 4),
}
