from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.data.foundation import CONTRACT_VERSION
from app.engines.system_design_visualization_engine import generate_readiness_zones, generate_risk_zones

DATABASES = {"postgresql", "mysql", "mongodb", "sqlite"}
CACHES = {"redis", "cache"}
QUEUES = {"queue", "rabbitmq", "sqs"}
EVENT_BUSES = {"kafka"}
VECTOR_DBS = {"vector_database", "pgvector", "qdrant", "pinecone"}
STORAGE = {"s3", "cloudflare_r2", "local_storage"}
OBSERVABILITY = {"observability", "prometheus", "grafana", "opentelemetry", "sentry"}
DEPLOYMENT = {"local", "docker", "docker_compose", "kubernetes", "vercel", "railway", "flyio"}
PAYMENT_PROVIDERS = {"stripe", "mercado_pago"}


def generate_architectural_graph(selection: dict[str, Any]) -> dict[str, Any]:
    normalized = _normalize(selection)
    nodes = generate_nodes(normalized)
    edges = generate_edges(normalized, nodes)
    layout = generate_graph_layout(nodes, edges, normalized["architecture_id"])
    warnings = _unique([warning for node in nodes for warning in node["warnings"]] + [edge["warning"] for edge in edges if edge.get("warning")])
    recommendations = _unique([item for node in nodes for item in node["recommendations"]])
    return {
        "contractVersion": CONTRACT_VERSION,
        "graph_id": str(uuid4()),
        "architecture_id": normalized["architecture_id"] or "unknown",
        "nodes": nodes,
        "edges": edges,
        "layout": layout,
        "warnings": warnings,
        "recommendations": recommendations,
    }


def generate_nodes(selection: dict[str, Any]) -> list[dict[str, Any]]:
    nodes = [_node("client", "Client", "client", "experience", selection)]
    architecture = selection["architecture_id"]
    module_ids = selection["business_module_ids"]
    capabilities = set(selection["capability_ids"])

    if selection["framework_id"] in {"nextjs", "react", "angular"}:
        nodes.append(_node("frontend", _label(selection["framework_id"]), "frontend", "experience", selection))

    if architecture == "microservices":
        nodes.extend(
            [
                _node("gateway", "API Gateway", "gateway", "boundary", selection),
                _node("auth_service", "Auth Service", "auth", "service", selection),
                _node("core_service", "Core Service", "service", "service", selection),
            ]
        )
        if "payments" in capabilities or "payments" in module_ids:
            nodes.append(_node("payment_service", "Payment Service", "service", "service", selection))
        for module in module_ids:
            if module not in {"payments"}:
                nodes.append(_node(f"{module}_service", f"{_label(module)} Service", "service", "module", selection))
    elif architecture == "modular_monolith":
        nodes.append(_node("app", "Application", "backend", "runtime", selection))
        for module in module_ids or ["auth", "domain"]:
            nodes.append(_node(f"{module}_module", f"{_label(module)} Module", "service" if module != "auth" else "auth", "module", selection))
    elif architecture == "event_driven":
        nodes.extend([_node("producer_service", "Producer Service", "service", "service", selection), _node("event_bus", "Event Bus", "event_bus", "event", selection), _node("consumer_service", "Consumer Service", "service", "service", selection)])
    else:
        nodes.append(_node("app", "Application", "backend", "runtime", selection))
        if architecture not in {"monolith", "hexagonal", "clean_architecture", "serverless", "cqrs", "distributed_system"}:
            nodes[-1]["warnings"].append("Unsupported architecture uses a safe application graph fallback.")

    if capabilities & {"rag", "ai_chat"}:
        nodes.append(_node("ai_service", "AI Service", "service", "ai", selection))
        if not any(item in selection["infrastructure_ids"] for item in VECTOR_DBS):
            nodes.append(_node("vector_database", "Vector Database", "vector_db", "data", selection))
    if "payments" in capabilities or "payments" in module_ids:
        nodes.append(_node("payment_provider", "Payment Provider", "external_provider", "external", selection))
        nodes.append(_node("audit_log", "Audit Trail", "observability", "audit", selection))

    for infrastructure_id in selection["infrastructure_ids"]:
        nodes.append(_node(infrastructure_id, _label(infrastructure_id), _infrastructure_type(infrastructure_id), "infrastructure", selection))

    if architecture == "microservices" and not any(item in selection["infrastructure_ids"] for item in DEPLOYMENT):
        nodes.append(_node("service_cluster", "Service Cluster", "deployment", "deployment", selection))
    return _dedupe(nodes)


def generate_edges(selection: dict[str, Any], nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    node_ids = {node["id"] for node in nodes}
    architecture = selection["architecture_id"]
    entry = "frontend" if "frontend" in node_ids else "client"
    edges: list[dict[str, Any]] = []

    if architecture == "microservices":
        edges.append(_edge(entry, "gateway", "sync", "ingress"))
        for service_id in [node["id"] for node in nodes if node["category"] in {"service", "module"} and node["type"] in {"service", "auth"}]:
            edges.append(_edge("gateway", service_id, "auth" if service_id == "auth_service" else "sync", "route"))
        service_anchor = "payment_service" if "payment_service" in node_ids else "core_service"
    elif architecture == "modular_monolith":
        edges.append(_edge(entry, "app", "sync", "request"))
        edges.extend(_edge("app", node["id"], "dependency", "module") for node in nodes if node["category"] == "module")
        service_anchor = "app"
    elif architecture == "event_driven":
        edges.extend([_edge(entry, "producer_service", "sync", "command"), _edge("producer_service", "event_bus", "event", "publish", animated=True), _edge("event_bus", "consumer_service", "async", "consume", animated=True)])
        service_anchor = "consumer_service"
    else:
        edges.append(_edge(entry, "app", "sync", "request"))
        service_anchor = "app"

    for node in nodes:
        if node["type"] == "database":
            edges.append(_edge(service_anchor, node["id"], "data", "persist"))
        elif node["type"] == "cache":
            edges.append(_edge(service_anchor, node["id"], "cache", "cache"))
        elif node["type"] == "queue":
            edges.append(_edge(service_anchor, node["id"], "queue", "enqueue", animated=True))
        elif node["type"] == "event_bus" and node["id"] != "event_bus":
            edges.append(_edge(service_anchor, node["id"], "event", "publish", animated=True))
        elif node["type"] == "observability" and node["id"] not in {"audit_log"}:
            for observed in [item for item in node_ids if item.endswith("_service") or item in {"app", "core_service"}][:4]:
                edges.append(_edge(observed, node["id"], "telemetry", "telemetry", animated=True))
        elif node["type"] == "deployment":
            for deployed in [item for item in node_ids if item.endswith("_service") or item in {"app", "core_service"}][:4]:
                edges.append(_edge(node["id"], deployed, "dependency", "hosts"))
        elif node["type"] == "vector_db" and "ai_service" in node_ids:
            edges.append(_edge("ai_service", node["id"], "data", "retrieve"))

    if "ai_service" in node_ids:
        edges.append(_edge("app" if "app" in node_ids else "core_service", "ai_service", "async", "AI request", animated=True))
        for observability_id in [node["id"] for node in nodes if node["type"] == "observability"][:1]:
            edges.append(_edge("ai_service", observability_id, "telemetry", "AI telemetry", animated=True))
    if "payment_service" in node_ids or ("payments" in selection["capability_ids"] and service_anchor in node_ids):
        payment_anchor = "payment_service" if "payment_service" in node_ids else service_anchor
        edges.append(_edge(payment_anchor, "payment_provider", "sync", "payment provider", warning="Payment edge requires audit trail."))
        edges.append(_edge(payment_anchor, "audit_log", "telemetry", "audit trail", animated=True))
        database_id = next((node["id"] for node in nodes if node["type"] == "database"), None)
        if database_id:
            edges.append(_edge(payment_anchor, database_id, "data", "transaction"))
    return _dedupe(edges)


def calculate_node_health(node_type: str, risk_level: str, warnings: list[str]) -> dict[str, Any]:
    status = "degraded" if risk_level == "critical" else "watch" if warnings or risk_level == "high" else "healthy"
    summary = "Operational review required." if status == "degraded" else "Watch burden and ownership." if status == "watch" else "Ready for visual topology review."
    return {"contractVersion": CONTRACT_VERSION, "status": status, "summary": summary}


def calculate_node_risk(node_id: str, node_type: str, selection: dict[str, Any]) -> dict[str, Any]:
    warnings: list[str] = []
    score = 18
    if node_id == "kafka" or node_type == "event_bus":
        score = 82
        warnings.append("Observability required for event bus operations.")
    if node_id == "kubernetes":
        score = 88
        warnings.append("High operational complexity.")
    if node_type == "external_provider":
        score = max(score, 52)
        warnings.append("External provider dependency requires contract review.")
    if node_type == "vector_db":
        score = max(score, 64)
    if selection["architecture_id"] == "microservices" and node_type in {"gateway", "service", "deployment"}:
        score = max(score, 62)
    level = "critical" if score >= 88 else "high" if score >= 70 else "medium" if score >= 42 else "low"
    return {"contractVersion": CONTRACT_VERSION, "level": level, "score": score, "warnings": warnings}


def calculate_node_readiness(node_id: str, node_type: str, selection: dict[str, Any]) -> dict[str, Any]:
    scores = {"database": 88, "client": 92, "frontend": 78, "cache": 74, "observability": 82, "deployment": 56, "event_bus": 52, "queue": 62, "external_provider": 58, "vector_db": 60}
    score = scores.get(node_type, 72)
    recommendations: list[str] = []
    if node_id == "kubernetes":
        score = 48
        recommendations.append("Pair cluster ownership with SRE and observability.")
    if node_id == "kafka":
        score = 54
        recommendations.append("Define event retention, alerting, and consumer ownership.")
    if node_id == "ai_service" and "rate_limiting" not in selection["capability_ids"]:
        score -= 12
        recommendations.append("Rate limiting recommended for AI service.")
    status = "ready" if score >= 70 else "warning" if score >= 42 else "blocked"
    return {"contractVersion": CONTRACT_VERSION, "score": score, "status": status, "recommendations": recommendations}


def calculate_node_ownership(node_id: str, node_type: str) -> dict[str, Any]:
    role, skills, boundary = {
        "database": ("backend/platform", ["data modeling", "backup posture"], "data persistence"),
        "cache": ("backend_engineer", ["cache invalidation"], "latency and session acceleration"),
        "queue": ("platform_engineer", ["async delivery"], "queue ownership"),
        "event_bus": ("platform_engineer", ["event operations", "observability"], "event contracts"),
        "deployment": ("devops/sre", ["release automation", "incident response"], "runtime delivery"),
        "observability": ("sre", ["metrics", "tracing"], "telemetry"),
        "external_provider": ("backend/security", ["provider contracts"], "external integration"),
        "frontend": ("frontend_engineer", ["user flow delivery"], "experience"),
        "gateway": ("platform_engineer", ["routing", "security baseline"], "ingress"),
        "auth": ("security_engineer", ["identity", "auditability"], "access control"),
        "vector_db": ("data/ai_engineer", ["retrieval data"], "vector retrieval"),
    }.get(node_type, ("backend_engineer", ["service ownership"], "application boundary"))
    if node_id == "kubernetes":
        role = "devops/sre"
    return {"contractVersion": CONTRACT_VERSION, "role": role, "required_skills": skills, "boundary": boundary}


def generate_graph_layout(nodes: list[dict[str, Any]], edges: list[dict[str, Any]], architecture_id: str) -> dict[str, Any]:
    del edges
    layer_by_type = {"client": 0, "frontend": 1, "gateway": 2, "backend": 3, "auth": 3, "service": 3, "event_bus": 4, "queue": 4, "database": 5, "cache": 5, "vector_db": 5, "storage": 5, "observability": 5, "external_provider": 5, "deployment": 2}
    grouped: dict[int, list[dict[str, Any]]] = {}
    for node in nodes:
        grouped.setdefault(layer_by_type.get(node["type"], 4), []).append(node)
    width = 1080
    height = max(520, max((len(items) for items in grouped.values()), default=1) * 118 + 120)
    points = []
    for layer, items in sorted(grouped.items()):
        for index, node in enumerate(items):
            x = 90 + layer * 170
            y = 80 + index * max(92, int((height - 160) / max(1, len(items))))
            points.append({"node_id": node["id"], "x": x, "y": y, "layer": layer})
    return {"contractVersion": CONTRACT_VERSION, "width": width, "height": height, "direction": "horizontal", "simplified_mobile": len(nodes) > 8 or architecture_id == "microservices", "points": points}


def generate_graph_snapshot(selection: dict[str, Any]) -> dict[str, Any]:
    return {"contractVersion": CONTRACT_VERSION, "graph": generate_architectural_graph(selection), "source": "preview", "generated_at": datetime.now(UTC).isoformat()}


def _node(node_id: str, label: str, node_type: str, category: str, selection: dict[str, Any]) -> dict[str, Any]:
    risk = calculate_node_risk(node_id, node_type, selection)
    readiness = calculate_node_readiness(node_id, node_type, selection)
    ownership = calculate_node_ownership(node_id, node_type)
    warnings = list(risk["warnings"])
    if node_id == "kubernetes":
        warnings.append("Kubernetes ownership requires SRE.")
    health = calculate_node_health(node_type, risk["level"], warnings)
    burden = _burden(node_id, node_type, selection)
    return {
        "contractVersion": CONTRACT_VERSION,
        "id": node_id,
        "label": label,
        "type": node_type,
        "category": category,
        "status": health["status"],
        "burden_score": burden,
        "risk_level": risk["level"],
        "readiness_score": readiness["score"],
        "ownership_role": ownership["role"],
        "required_skills": ownership["required_skills"],
        "warnings": warnings,
        "recommendations": readiness["recommendations"],
        "health": health,
        "risk": risk,
        "readiness": readiness,
        "ownership": ownership,
    }


def _edge(source: str, target: str, edge_type: str, label: str, animated: bool = False, warning: str | None = None) -> dict[str, Any]:
    return {"contractVersion": CONTRACT_VERSION, "id": f"{source}->{target}:{edge_type}:{label}", "source_id": source, "target_id": target, "type": edge_type, "label": label, "animated": animated, "warning": warning}


def _burden(node_id: str, node_type: str, selection: dict[str, Any]) -> str:
    if node_id in {"kubernetes"}:
        return "enterprise"
    if node_id == "kafka" or node_type == "event_bus":
        return "high"
    if node_type in {"deployment", "queue", "vector_db"} or (selection["architecture_id"] == "microservices" and node_type in {"gateway", "service"}):
        return "high"
    if node_type in {"database", "external_provider", "observability"}:
        return "medium"
    return "low"


def _infrastructure_type(item_id: str) -> str:
    if item_id in DATABASES:
        return "database"
    if item_id in CACHES:
        return "cache"
    if item_id in QUEUES:
        return "queue"
    if item_id in EVENT_BUSES:
        return "event_bus"
    if item_id in VECTOR_DBS:
        return "vector_db"
    if item_id in STORAGE:
        return "storage"
    if item_id in OBSERVABILITY:
        return "observability"
    if item_id in DEPLOYMENT:
        return "deployment"
    if item_id in PAYMENT_PROVIDERS:
        return "external_provider"
    return "service"


def _normalize(selection: dict[str, Any]) -> dict[str, Any]:
    normalized = {
        "language_id": str(selection.get("language_id") or "").strip(),
        "framework_id": str(selection.get("framework_id") or "").strip(),
        "architecture_id": str(selection.get("architecture_id") or "").strip(),
        "capability_ids": _unique(selection.get("capability_ids") or []),
        "business_module_ids": _unique(selection.get("business_module_ids") or []),
        "infrastructure_ids": _unique(selection.get("infrastructure_ids") or []),
    }
    # Pull graph knowledge from the engines exercised by the current architecture selection.
    normalized["risk_zones"] = generate_risk_zones(normalized)
    normalized["readiness_zones"] = generate_readiness_zones(normalized)
    return normalized


def _label(value: str) -> str:
    labels = {"spring_boot": "Spring Boot", "nextjs": "Next.js", "pgvector": "pgvector", "rbac": "RBAC", "ai_chat": "AI Chat"}
    return labels.get(value, value.replace("_", " ").title())


def _unique(values: Iterable[Any]) -> list[str]:
    return list(dict.fromkeys(str(value) for value in values if value))


def _dedupe(items: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        if item["id"] in seen:
            continue
        output.append(item)
        seen.add(item["id"])
    return output
