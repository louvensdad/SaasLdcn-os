from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from app.data.foundation import CONTRACT_VERSION
from app.engines.dependency_graph_engine import generate_dependency_snapshot
from app.engines.engineering_readiness_engine import calculate_engineering_readiness

OBSERVABILITY_IDS = {"observability", "prometheus", "grafana", "opentelemetry", "sentry"}
DATABASE_IDS = {"postgresql", "mysql", "mongodb", "sqlite"}
CACHE_IDS = {"redis", "cache"}
QUEUE_IDS = {"queue", "rabbitmq", "kafka", "sqs"}
VECTOR_IDS = {"vector_database", "pgvector", "qdrant", "pinecone"}
STORAGE_IDS = {"s3", "cloudflare_r2", "local_storage"}
AUTH_IDS = {"auth", "authentication", "jwt", "keycloak", "auth0", "clerk", "nextauth"}
DEPLOYMENT_IDS = {"local", "docker", "docker_compose", "kubernetes", "vercel", "railway", "flyio"}


def generate_architecture_topology(selection: dict[str, Any]) -> dict[str, Any]:
    normalized = _normalize(selection)
    architecture = normalized["architecture_id"]
    nodes = [_service("client", "Client", "client", "experience", "Product", "Entry request surface")]
    edges: list[dict[str, Any]] = []
    signals: list[str] = []
    zones = ["experience", "application"]

    if normalized["framework_id"] in {"nextjs", "react", "angular"}:
        nodes.append(_service("frontend", _framework_label(normalized["framework_id"]), "frontend", "experience", "Frontend", "Interactive application surface"))
        edges.append(_edge("client", "frontend", "sync", "request"))
        entry_id = "frontend"
    else:
        entry_id = "client"

    if architecture == "microservices":
        nodes.extend(
            [
                _service("gateway", "API Gateway", "gateway", "boundary", "Platform", "Distributed service ingress"),
                _service("auth_service", "Auth Service", "auth", "services", "Backend", "Identity and access boundary"),
                _service("core_service", "Core Service", "service", "services", "Backend", f"{_framework_label(normalized['framework_id'])} domain runtime"),
                _service("payment_service", "Payment Service", "service", "services", "Backend", "Transactional workflow ownership"),
                _service("telemetry", "Distributed Observability", "observability", "operations", "Platform", "Logs, metrics, and traces"),
            ]
        )
        edges.extend(
            [
                _edge(entry_id, "gateway", "sync", "ingress"),
                _edge("gateway", "auth_service", "auth", "authorize"),
                _edge("gateway", "core_service", "sync", "route"),
                _edge("core_service", "payment_service", "async" if _has(normalized, QUEUE_IDS) else "sync", "coordinate", animated=True),
                _edge("core_service", "telemetry", "observability", "trace", animated=True),
                _edge("payment_service", "telemetry", "observability", "metric", animated=True),
            ]
        )
        zones.extend(["boundary", "services", "operations"])
        signals.extend(["Gateway ingress and service cluster active.", "Queue and event flow visualize distributed coordination.", "Deployment complexity high."])
    elif architecture == "event_driven":
        nodes.extend(
            [
                _service("application", "Command Service", "service", "application", "Backend", "Command owner"),
                _service("event_bus", "Event Bus", "queue", "events", "Platform", "Async integration boundary"),
                _service("projection", "Projection Service", "service", "application", "Backend", "Event consumer"),
            ]
        )
        edges.extend([_edge(entry_id, "application", "sync", "command"), _edge("application", "event_bus", "event", "publish", animated=True), _edge("event_bus", "projection", "async", "consume", animated=True)])
        zones.append("events")
        signals.extend(["Event bus active.", "Async edges indicate eventual consistency."])
    elif architecture == "modular_monolith":
        nodes.extend([_service("module_shell", "Application Shell", "backend", "application", "Backend", "Single deployable"), _service("auth_module", "Auth Module", "auth", "modules", "Backend", "Bounded module"), _service("domain_module", "Domain Module", "service", "modules", "Backend", "Bounded module")])
        edges.extend([_edge(entry_id, "module_shell", "sync", "request"), _edge("module_shell", "auth_module", "auth", "module boundary"), _edge("module_shell", "domain_module", "dependency", "shared runtime")])
        zones.append("modules")
        signals.extend(["Bounded modules share one runtime.", "Shared database ownership stays visible."])
    elif architecture == "hexagonal":
        nodes.extend([_service("ports", "Ports", "gateway", "ports", "Backend", "Inbound contracts"), _service("domain", "Domain Core", "service", "domain", "Backend", "Isolated application logic"), _service("adapters", "Adapters", "backend", "adapters", "Backend", "Infrastructure adapters")])
        edges.extend([_edge(entry_id, "ports", "sync", "port"), _edge("ports", "domain", "dependency", "use case"), _edge("domain", "adapters", "data", "adapter")])
        zones.extend(["ports", "domain", "adapters"])
        signals.extend(["Ports and adapters isolate infrastructure.", "Runtime flow preserves domain boundary."])
    else:
        nodes.append(_service("application", "Application Service", "backend", "application", "Backend", f"{_framework_label(normalized['framework_id'])} runtime"))
        edges.append(_edge(entry_id, "application", "sync", "request"))
        signals.append("Single service runtime flow active." if architecture == "monolith" else "Safe application topology fallback active.")

    complexity = "high" if architecture in {"microservices", "event_driven", "distributed_system", "cqrs"} else "medium" if architecture in {"modular_monolith", "hexagonal", "clean_architecture"} else "low"
    return {"contractVersion": CONTRACT_VERSION, "architecture_id": architecture or "unknown", "complexity": complexity, "nodes": nodes, "edges": edges, "zones": _unique(zones), "signals": signals}


def generate_infrastructure_topology(selection: dict[str, Any]) -> dict[str, Any]:
    normalized = _normalize(selection)
    nodes = [_infra(item_id, _infrastructure_type(item_id)) for item_id in normalized["infrastructure_ids"]]
    architecture_node = _infra("runtime", "deployment", label=_framework_label(normalized["framework_id"]), provider="derived", ownership="Backend")
    nodes.insert(0, architecture_node)
    edges = [_edge("runtime", node["id"], _edge_type_for_node(node["type"]), f"{node['type']} link", animated=node["type"] in {"queue", "observability"}) for node in nodes[1:]]
    if not nodes[1:]:
        nodes.append(_infra("local", "deployment", label="Local Runtime", provider="derived", ownership="Backend"))
        edges.append(_edge("runtime", "local", "dependency", "safe fallback"))
    burden = calculate_engineering_readiness(normalized)["operational_burden"]["level"]
    signals = [f"{node['label']} owned by {node['ownership']}." for node in nodes[1:4]]
    return {"contractVersion": CONTRACT_VERSION, "nodes": nodes, "edges": edges, "burden": burden, "ownership_signals": signals or ["Infrastructure selection remains local and bounded."]}


def generate_runtime_flow(selection: dict[str, Any]) -> dict[str, Any]:
    normalized = _normalize(selection)
    topology = generate_architecture_topology(normalized)
    infrastructure = generate_infrastructure_topology(normalized)
    nodes = list(topology["nodes"])
    edges = list(topology["edges"])
    data_nodes = [node for node in infrastructure["nodes"] if node["type"] in {"database", "cache", "queue", "vector_db", "external_provider", "observability"}]
    nodes.extend(_service(node["id"], node["label"], node["type"], "infrastructure", node["ownership"], node["detail"], emphasis="supporting") for node in data_nodes)
    anchor = "payment_service" if any(node["id"] == "payment_service" for node in nodes) else "domain_module" if any(node["id"] == "domain_module" for node in nodes) else "application"
    if not any(node["id"] == anchor for node in nodes):
        anchor = topology["nodes"][-1]["id"]
    for node in data_nodes:
        edges.append(_edge(anchor, node["id"], _edge_type_for_node(node["type"]), node["type"], animated=node["type"] in {"queue", "observability"}))
    mode = "evented" if normalized["architecture_id"] == "event_driven" else "distributed" if normalized["architecture_id"] == "microservices" else "bounded" if normalized["architecture_id"] in {"modular_monolith", "hexagonal"} else "simple"
    steps = [node["label"] for node in nodes if node["type"] not in {"observability"}][:8]
    return {"contractVersion": CONTRACT_VERSION, "nodes": _dedupe_nodes(nodes), "edges": _dedupe_edges(edges), "steps": steps, "mode": mode}


def generate_dependency_visualization(selection: dict[str, Any]) -> dict[str, Any]:
    snapshot = generate_dependency_snapshot(selection)
    activated = snapshot["propagation"]["activated_node_ids"]
    required = snapshot["propagation"]["required_node_ids"]
    recommended = snapshot["propagation"]["recommended_node_ids"]
    nodes = [_service(item, item.replace("_", " ").title(), "service", "selection", "Architecture", "Activated dependency") for item in activated[:8]]
    nodes.extend(_service(item, item.replace("_", " ").title(), "observability" if item == "observability" else "service", "propagation", "Platform", "Propagated requirement") for item in required + recommended[:4])
    root = snapshot["architecture_id"] or (activated[0] if activated else "selection")
    edges = [_edge(root, item, "dependency", "requires", animated=True) for item in required]
    edges.extend(_edge(root, item, "dependency", "recommends", animated=True) for item in recommended[:4])
    mutation_chains = [f"{mutation['trigger_node_id']} -> {mutation['mutated_value']}" for mutation in snapshot["mutations"][:5]]
    chains = [f"{root} -> {item} required" for item in required] + mutation_chains
    burden = [mutation["rationale"] for mutation in snapshot["mutations"] if mutation["category"] in {"deployment", "scalability"}]
    return {"contractVersion": CONTRACT_VERSION, "nodes": _dedupe_nodes(nodes), "edges": _dedupe_edges(edges), "chains": chains or ["Selection remains bounded."], "conflicts": snapshot["propagation"]["conflicting_node_ids"], "burden_signals": burden or snapshot["impact_profile"]["rationale"][:3]}


def generate_risk_zones(selection: dict[str, Any]) -> list[dict[str, Any]]:
    normalized = _normalize(selection)
    dependency = generate_dependency_snapshot(normalized)
    readiness = calculate_engineering_readiness(normalized)
    zones = [_risk(issue["id"], issue["title"], issue["severity"], "dependency", issue["summary"], issue["related_node_ids"]) for issue in dependency["risk_profile"]["issues"]]
    zones.extend(_risk(risk["id"], risk["title"], risk["severity"], risk["category"], risk["summary"], risk["related_ids"]) for risk in readiness["engineering_risks"])
    if normalized["architecture_id"] == "microservices" and not _has(normalized, OBSERVABILITY_IDS):
        zones.append(_risk("missing_observability", "Missing observability", "critical", "operations", "Distributed topology is hard to diagnose without telemetry.", ["microservices", "observability"]))
    if not zones:
        zones.append(_risk("bounded_topology", "Bounded topology", "info", "architecture", "No high-risk visualization zones were detected.", [normalized["architecture_id"] or "selection"]))
    return _dedupe_by_id(zones)


def generate_readiness_zones(selection: dict[str, Any]) -> list[dict[str, Any]]:
    dependency = generate_dependency_snapshot(selection)["readiness_profile"]
    engineering = calculate_engineering_readiness(selection)["production_readiness"]
    return [
        _readiness("mvp", "MVP Readiness", dependency["mvp_readiness"], "Blueprint can shape an MVP flow."),
        _readiness("production", "Production Readiness", engineering["score"], "Operational and deployment baselines for production."),
        _readiness("enterprise", "Enterprise Readiness", dependency["enterprise_readiness"], "Governance and enterprise maturity."),
        _readiness("scalability", "Scalability Readiness", dependency["scalability_readiness"], "Scale and boundary pressure."),
        _readiness("team", "Team Readiness", engineering["team_readiness"], "Ownership and human operational maturity."),
    ]


def generate_team_topology(selection: dict[str, Any]) -> dict[str, Any]:
    team = calculate_engineering_readiness(selection)["team_recommendation"]
    nodes = [_service(role["id"], role["title"], _role_type(role["id"]), "ownership", role["title"], role["recommended_level"].replace("_", " "), emphasis="primary" if role["id"] in {"backend_engineer", "platform_engineer"} else "supporting") for role in team["roles"]]
    anchor = "backend_engineer" if any(node["id"] == "backend_engineer" for node in nodes) else nodes[0]["id"]
    edges = [_edge(anchor, node["id"], "dependency", "coordinates") for node in nodes if node["id"] != anchor]
    maturity = team["required_seniority"].replace("_", " ")
    coordination = "distributed operational coordination" if any(node["id"] == "platform_engineer" for node in nodes) else "bounded delivery coordination"
    boundaries = [f"{node['label']} owns {node['zone']}." for node in nodes[:6]]
    return {"contractVersion": CONTRACT_VERSION, "nodes": nodes, "edges": edges, "maturity": maturity, "coordination": coordination, "ownership_boundaries": boundaries}


def generate_deployment_topology(selection: dict[str, Any]) -> dict[str, Any]:
    normalized = _normalize(selection)
    infrastructure = set(normalized["infrastructure_ids"])
    readiness = calculate_engineering_readiness(normalized)
    mode = "kubernetes" if "kubernetes" in infrastructure else "docker" if infrastructure & {"docker", "docker_compose"} else "edge" if infrastructure & {"vercel", "flyio"} else "serverless" if normalized["architecture_id"] == "serverless" else "local"
    if mode in {"kubernetes", "edge"} and len(infrastructure & DEPLOYMENT_IDS) > 1:
        mode = "hybrid"
    nodes = [_infra("source", "deployment", label="Build Artifact", provider="derived", ownership="Engineering")]
    target_ids = [item for item in normalized["infrastructure_ids"] if item in DEPLOYMENT_IDS] or [mode]
    nodes.extend(_infra(item, "deployment", label=item.replace("_", " ").title(), ownership="Platform" if item == "kubernetes" else "Engineering") for item in target_ids)
    edges = [_edge("source", node["id"], "dependency", "deploy", animated=True) for node in nodes[1:]]
    burden = readiness["operational_burden"]["deployment_burden"]
    overhead = "high cluster and release overhead" if "kubernetes" in infrastructure else "managed delivery overhead" if mode in {"edge", "serverless"} else "bounded deployment overhead"
    scaling = "service scaling expands platform ownership" if normalized["architecture_id"] == "microservices" else "single deployment path controls scaling"
    return {"contractVersion": CONTRACT_VERSION, "mode": mode, "nodes": nodes, "edges": edges, "deployment_burden": burden, "operational_overhead": overhead, "scaling_impact": scaling}


def generate_visualization_snapshot(selection: dict[str, Any]) -> dict[str, Any]:
    return {
        "contractVersion": CONTRACT_VERSION,
        "architecture_topology": generate_architecture_topology(selection),
        "infrastructure_topology": generate_infrastructure_topology(selection),
        "runtime_flow": generate_runtime_flow(selection),
        "dependency_visualization": generate_dependency_visualization(selection),
        "risk_zones": generate_risk_zones(selection),
        "readiness_zones": generate_readiness_zones(selection),
        "team_topology": generate_team_topology(selection),
        "deployment_topology": generate_deployment_topology(selection),
    }


def _normalize(selection: dict[str, Any]) -> dict[str, Any]:
    return {"language_id": str(selection.get("language_id") or "").strip(), "framework_id": str(selection.get("framework_id") or "").strip(), "architecture_id": str(selection.get("architecture_id") or "").strip(), "capability_ids": _unique(selection.get("capability_ids") or []), "infrastructure_ids": _unique(selection.get("infrastructure_ids") or [])}


def _service(node_id: str, label: str, node_type: str, zone: str, ownership: str, detail: str, emphasis: str = "primary") -> dict[str, Any]:
    return {"contractVersion": CONTRACT_VERSION, "id": node_id, "label": label, "type": node_type, "zone": zone, "ownership": ownership, "detail": detail, "emphasis": emphasis}


def _infra(node_id: str, node_type: str, *, label: str | None = None, provider: str = "selected", ownership: str | None = None) -> dict[str, Any]:
    owner = ownership or ("Platform" if node_type in {"deployment", "observability", "queue"} else "Backend")
    return {"contractVersion": CONTRACT_VERSION, "id": node_id, "label": label or node_id.replace("_", " ").title(), "type": node_type, "provider": provider, "ownership": owner, "detail": f"{node_type.replace('_', ' ')} topology node"}


def _edge(source: str, target: str, edge_type: str, label: str, animated: bool = False) -> dict[str, Any]:
    return {"contractVersion": CONTRACT_VERSION, "id": f"{source}->{target}:{edge_type}:{label}", "source_id": source, "target_id": target, "type": edge_type, "label": label, "animated": animated}


def _risk(zone_id: str, label: str, severity: str, category: str, summary: str, related: list[str]) -> dict[str, Any]:
    return {"contractVersion": CONTRACT_VERSION, "id": zone_id, "label": label, "severity": severity, "category": category, "summary": summary, "related_node_ids": related}


def _readiness(zone_id: str, label: str, score: int, summary: str) -> dict[str, Any]:
    status = "healthy" if score >= 70 else "warning" if score >= 42 else "blocked"
    return {"contractVersion": CONTRACT_VERSION, "id": zone_id, "label": label, "score": score, "status": status, "summary": summary}


def _infrastructure_type(item_id: str) -> str:
    if item_id in DATABASE_IDS:
        return "database"
    if item_id in CACHE_IDS:
        return "cache"
    if item_id in QUEUE_IDS:
        return "queue"
    if item_id in OBSERVABILITY_IDS:
        return "observability"
    if item_id in VECTOR_IDS:
        return "vector_db"
    if item_id in STORAGE_IDS:
        return "storage"
    if item_id in AUTH_IDS:
        return "auth" if item_id in {"auth", "authentication", "jwt"} else "external_provider"
    if item_id in DEPLOYMENT_IDS:
        return "deployment"
    if item_id in {"stripe", "mercado_pago"}:
        return "external_provider"
    return "service"


def _edge_type_for_node(node_type: str) -> str:
    return {"database": "data", "cache": "cache", "queue": "queue", "observability": "observability", "auth": "auth", "external_provider": "sync", "vector_db": "data"}.get(node_type, "dependency")


def _role_type(role_id: str) -> str:
    if "frontend" in role_id:
        return "frontend"
    if role_id in {"devops_engineer", "platform_engineer", "sre"}:
        return "deployment"
    if "security" in role_id:
        return "auth"
    if "ai" in role_id or "data" in role_id:
        return "vector_db"
    return "service"


def _framework_label(framework_id: str) -> str:
    return {"spring_boot": "Spring Boot", "nextjs": "Next.js", "fastapi": "FastAPI", "nestjs": "NestJS"}.get(framework_id, framework_id.replace("_", " ").title() or "Application")


def _has(selection: dict[str, Any], ids: set[str]) -> bool:
    return bool((set(selection["capability_ids"]) | set(selection["infrastructure_ids"])) & ids)


def _unique(values: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(str(value) for value in values if value))


def _dedupe_nodes(items: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return _dedupe_by_id(list(items))


def _dedupe_edges(items: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return _dedupe_by_id(list(items))


def _dedupe_by_id(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        output.append(item)
    return output
