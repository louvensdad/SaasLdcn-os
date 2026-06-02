from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from app.data.foundation import CONTRACT_VERSION

BAND_LIMITS = ((35, "low"), (58, "medium"), (78, "high"))
OBSERVABILITY_IDS = {"observability", "prometheus", "grafana", "opentelemetry", "sentry"}
AI_IDS = {"ai_chat", "rag", "vector_database", "pgvector", "qdrant", "pinecone"}
QUEUE_IDS = {"queue", "rabbitmq", "kafka", "sqs"}
SECURITY_IDS = {"auth", "authentication", "rbac", "payments", "rate_limiting", "audit_logs"}


def calculate_team_requirements(selection: dict[str, Any]) -> dict[str, Any]:
    normalized = _normalize(selection)
    capabilities = set(normalized["capability_ids"])
    infrastructure = set(normalized["infrastructure_ids"])
    distributed = normalized["architecture_id"] in {"microservices", "distributed_system", "event_driven", "cqrs"}
    has_ai = bool((capabilities | infrastructure) & AI_IDS)
    spring_enterprise = normalized["framework_id"] == "spring_boot"
    nextjs_fullstack = normalized["framework_id"] == "nextjs"

    roles = [
        _role(
            "backend_engineer",
            "Backend Engineer",
            "senior_plus" if spring_enterprise or distributed else "senior",
            [_skill("application_design", "Application design", "required", "Own service boundaries and data flows.")],
            [_skill("api_contracts", "API contracts", "optional", "Keep delivery surfaces stable.")],
        ),
        _role(
            "qa_engineer",
            "QA Engineer",
            "senior" if distributed or "payments" in capabilities else "mid",
            [_skill("test_strategy", "Test strategy", "required", "Readiness depends on regression coverage.")],
            [_skill("performance_testing", "Performance testing", "optional", "Validate production capacity.")],
        ),
    ]
    expertise = [
        _skill("delivery_discipline", "Architecture discipline", "required", "Keep complexity aligned with the selected foundation."),
    ]
    rationale = ["The baseline keeps backend ownership and validation explicit."]

    if normalized["framework_id"] in {"nextjs", "react", "angular"}:
        roles.insert(
            0,
            _role(
                "frontend_engineer",
                "Frontend Engineer",
                "senior" if nextjs_fullstack else "mid",
                [_skill("frontend_delivery", "Frontend delivery", "required", "Own user-facing workflow states.")],
                [_skill("fullstack_overlap", "Backend overlap", "optional", "Coordinate Next.js server surfaces.")],
            ),
        )
        rationale.append("Next.js and frontend stacks need UI ownership with backend overlap.")

    if distributed or "kubernetes" in infrastructure:
        roles.extend(
            [
                _role(
                    "platform_engineer",
                    "Platform Engineer",
                    "senior_plus",
                    [_skill("platform_maturity", "Platform maturity", "required", "Distributed delivery needs repeatable runtime baselines.")],
                    [_skill("service_mesh", "Service networking", "optional", "Useful as service count grows.")],
                ),
                _role(
                    "devops_engineer",
                    "DevOps Engineer",
                    "senior",
                    [_skill("devops_baseline", "DevOps knowledge", "required", "Own delivery automation and cluster operations.")],
                    [_skill("incident_automation", "Incident automation", "optional", "Reduce operational toil.")],
                ),
            ]
        )
        expertise.extend(
            [
                _skill("observability_expertise", "Observability expertise", "required", "Service boundaries must remain traceable."),
                _skill("devops_baseline", "DevOps knowledge", "required", "Distributed systems need operational ownership."),
            ]
        )
        rationale.append("Microservices and orchestration raise platform and observability expectations.")

    if "kubernetes" in infrastructure:
        roles.append(
            _role(
                "sre",
                "SRE",
                "senior_plus",
                [_skill("kubernetes_operations", "Kubernetes operations", "required", "Clusters raise release and incident complexity.")],
                [_skill("slo_design", "SLO design", "optional", "Define production health budgets.")],
            )
        )
        rationale.append("Kubernetes increases DevOps requirement and readiness complexity.")

    if spring_enterprise or distributed:
        roles.append(
            _role(
                "architect",
                "Architect",
                "staff" if distributed else "senior_plus",
                [_skill("boundary_governance", "Architecture discipline", "required", "Govern enterprise boundaries and tradeoffs.")],
                [_skill("domain_modeling", "Domain modeling", "optional", "Strengthen modular ownership.")],
            )
        )
        rationale.append("Spring Boot enterprise paths recommend backend senior+ and architecture discipline.")

    if has_ai:
        roles.extend(
            [
                _role(
                    "data_engineer",
                    "Data Engineer",
                    "senior",
                    [_skill("vector_data", "Vector database understanding", "required", "RAG retrieval needs explicit data ownership.")],
                    [_skill("pipeline_quality", "Data quality", "optional", "Keep retrieval inputs reliable.")],
                ),
                _role(
                    "ai_engineer",
                    "AI Engineer",
                    "senior",
                    [_skill("ai_infra", "AI infra knowledge", "required", "AI workloads add runtime and monitoring baselines.")],
                    [_skill("async_python", "Async Python expertise", "optional", "FastAPI AI paths benefit from concurrency discipline.")],
                ),
            ]
        )
        expertise.extend(
            [
                _skill("ai_infra", "AI infra knowledge", "required", "AI runtime infrastructure must be observable."),
                _skill("vector_data", "Vector database understanding", "required", "Retrieval data paths need specialized ownership."),
            ]
        )
        rationale.append("FastAPI AI/RAG profiles require AI infrastructure and vector data literacy.")

    if normalized["framework_id"] == "fastapi":
        expertise.append(_skill("async_python", "Async Python expertise", "recommended", "FastAPI concurrency changes implementation shape."))

    if capabilities & SECURITY_IDS:
        roles.append(
            _role(
                "security_engineer",
                "Security Engineer",
                "senior",
                [_skill("security_baseline", "Security baseline", "required", "Authentication and payments widen the human review surface.")],
                [_skill("threat_modeling", "Threat modeling", "optional", "Reduce production exposure.")],
            )
        )

    roles = _dedupe_by_id(roles)
    team_size = min(12, max(3, 2 + len(roles) + (1 if distributed else 0) + (1 if "kubernetes" in infrastructure else 0)))
    required_seniority = "staff" if normalized["architecture_id"] == "distributed_system" else "senior_plus" if distributed or spring_enterprise or "kubernetes" in infrastructure else "senior"

    return {
        "contractVersion": CONTRACT_VERSION,
        "team_size": team_size,
        "required_seniority": required_seniority,
        "roles": roles,
        "required_expertise": _dedupe_by_id(expertise),
        "rationale": _unique(rationale),
    }


def calculate_engineering_readiness(selection: dict[str, Any]) -> dict[str, Any]:
    team = calculate_team_requirements(selection)
    delivery = estimate_delivery_complexity(selection)
    burden = estimate_operational_burden(selection)
    learning = calculate_learning_curve(selection)
    production = estimate_production_readiness(selection)
    risks = detect_human_risks(selection)
    critical_risks = sum(1 for item in risks if item["severity"] == "critical")
    warning_risks = sum(1 for item in risks if item["severity"] == "warning")
    overall = _clamp(round((production["score"] + production["team_readiness"] + (100 - delivery["complexity"]["score"])) / 3) - critical_risks * 5)

    return {
        "contractVersion": CONTRACT_VERSION,
        "overall_readiness": overall,
        "team_size": team["team_size"],
        "recommended_roles": team["roles"],
        "required_seniority": team["required_seniority"],
        "onboarding_complexity": learning["onboarding_complexity"],
        "production_risk": _clamp(100 - production["score"] + critical_risks * 8),
        "operational_risk": _clamp(burden["score"] + warning_risks * 4),
        "maintenance_risk": _clamp(delivery["complexity"]["score"] - 8),
        "scaling_risk": _clamp(burden["service_ownership"] + (18 if _normalize(selection)["architecture_id"] == "microservices" else 0)),
        "delivery_estimate": delivery,
        "learning_curve": learning,
        "enterprise_readiness": _clamp(production["score"] - (12 if production["missing_baselines"] else 0)),
        "deployment_readiness": production["deployment_readiness"],
        "team_recommendation": team,
        "operational_burden": burden,
        "delivery_complexity": delivery["complexity"],
        "production_readiness": production,
        "engineering_risks": risks,
    }


def calculate_learning_curve(selection: dict[str, Any]) -> dict[str, Any]:
    normalized = _normalize(selection)
    capabilities = set(normalized["capability_ids"])
    infrastructure = set(normalized["infrastructure_ids"])
    score = 26 + len(capabilities) * 3 + len(infrastructure) * 2
    focus = [f"{normalized['framework_id']} delivery conventions"]
    if normalized["architecture_id"] == "microservices":
        score += 20
        focus.extend(["Service boundary ownership", "Distributed observability"])
    if normalized["framework_id"] == "spring_boot":
        score += 12
        focus.append("Spring Boot enterprise architecture discipline")
    if normalized["framework_id"] == "fastapi":
        focus.append("Async Python request and worker flows")
    if normalized["framework_id"] == "nextjs":
        score += 6
        focus.append("Frontend and backend overlap")
    if "kubernetes" in infrastructure:
        score += 20
        focus.append("Kubernetes release and incident practice")
    if capabilities & {"rag", "ai_chat"}:
        score += 14
        focus.extend(["AI infrastructure baselines", "Vector database retrieval paths"])
    level = _band(score)
    ramp_up_weeks = {"low": 1, "medium": 2, "high": 4, "enterprise": 6}[level]
    return {
        "contractVersion": CONTRACT_VERSION,
        "score": _clamp(score),
        "level": level,
        "onboarding_complexity": level,
        "ramp_up_weeks": ramp_up_weeks,
        "learning_focus": _unique(focus),
    }


def estimate_delivery_complexity(selection: dict[str, Any]) -> dict[str, Any]:
    normalized = _normalize(selection)
    capabilities = set(normalized["capability_ids"])
    infrastructure = set(normalized["infrastructure_ids"])
    architecture = normalized["architecture_id"]
    score = 28 + len(capabilities) * 4 + len(infrastructure) * 3
    drivers = [f"{len(capabilities)} selected capabilities", f"{len(infrastructure)} infrastructure dependencies"]
    if architecture == "microservices":
        score += 24
        drivers.append("Microservices service coordination")
    elif architecture in {"event_driven", "cqrs", "distributed_system"}:
        score += 18
        drivers.append("Distributed architecture coordination")
    if normalized["framework_id"] == "spring_boot":
        score += 8
        drivers.append("Spring Boot enterprise onboarding")
    if normalized["framework_id"] == "nextjs":
        score += 5
        drivers.append("Next.js full-stack overlap")
    if normalized["framework_id"] == "fastapi" and capabilities & {"rag", "ai_chat"}:
        score += 14
        drivers.append("FastAPI AI/RAG delivery path")
    if "kubernetes" in infrastructure:
        score += 18
        drivers.append("Kubernetes production baseline")
    score = _clamp(score)
    level = _band(score)
    complexity = {
        "contractVersion": CONTRACT_VERSION,
        "score": score,
        "level": level,
        "maintenance_effort": _band(score - 6),
        "onboarding_effort": _band(score + (6 if normalized["framework_id"] == "spring_boot" else 0)),
        "deployment_burden": _band(score + (10 if architecture == "microservices" or "kubernetes" in infrastructure else 0)),
        "complexity_drivers": _unique(drivers),
    }
    target = "enterprise_ready" if score >= 78 else "production_ready" if score >= 58 else "mvp" if score >= 35 else "prototype"
    implementation = max(2, round(score / 12))
    hardening = 1 + (2 if target in {"production_ready", "enterprise_ready"} else 0) + (1 if "kubernetes" in infrastructure else 0)
    validation = 1 + (1 if capabilities & SECURITY_IDS else 0)
    weeks = implementation + hardening + validation
    return {
        "contractVersion": CONTRACT_VERSION,
        "target": target,
        "estimated_weeks": weeks,
        "confidence": "medium" if level in {"low", "medium"} else "high" if target == "production_ready" else "enterprise",
        "complexity": complexity,
        "phases": [
            {"id": "implementation", "label": "Implementation", "weeks": implementation},
            {"id": "hardening", "label": "Production hardening", "weeks": hardening},
            {"id": "validation", "label": "Validation and handoff", "weeks": validation},
        ],
    }


def estimate_operational_burden(selection: dict[str, Any]) -> dict[str, Any]:
    normalized = _normalize(selection)
    capabilities = set(normalized["capability_ids"])
    infrastructure = set(normalized["infrastructure_ids"])
    distributed = normalized["architecture_id"] in {"microservices", "distributed_system", "event_driven", "cqrs"}
    deployment = 26 + len(infrastructure) * 4 + (22 if distributed else 0) + (24 if "kubernetes" in infrastructure else 0)
    ownership = 24 + len(capabilities) * 4 + (26 if distributed else 0)
    observability = 24 + (20 if distributed else 0) + (12 if bool(infrastructure & QUEUE_IDS) else 0)
    incident = 22 + (18 if "payments" in capabilities else 0) + (18 if bool(capabilities & {"rag", "ai_chat"}) else 0) + (16 if "kubernetes" in infrastructure else 0)
    score = _clamp(round((deployment + ownership + observability + incident) / 4))
    signals = []
    if distributed:
        signals.append("Microservices require platform maturity.")
    if "kubernetes" in infrastructure:
        signals.append("Kubernetes raises deployment and incident ownership.")
    if bool((capabilities | infrastructure) & QUEUE_IDS):
        signals.append("Queue-backed delivery expands async operational paths.")
    if not _has_observability(capabilities, infrastructure) and (distributed or "kubernetes" in infrastructure):
        signals.append("Operational burden increased without an observability baseline.")
    return {
        "contractVersion": CONTRACT_VERSION,
        "score": score,
        "level": _band(score),
        "service_ownership": _clamp(ownership),
        "deployment_burden": _clamp(deployment),
        "observability_burden": _clamp(observability),
        "incident_burden": _clamp(incident),
        "maintenance_effort": _band(score - 4),
        "signals": signals or ["Operational burden remains bounded by the selected foundation."],
    }


def estimate_production_readiness(selection: dict[str, Any]) -> dict[str, Any]:
    normalized = _normalize(selection)
    capabilities = set(normalized["capability_ids"])
    infrastructure = set(normalized["infrastructure_ids"])
    team = calculate_team_requirements(normalized)
    distributed = normalized["architecture_id"] in {"microservices", "distributed_system", "event_driven", "cqrs"}
    missing = []
    operational = 76
    deployment = 74
    if distributed and not _has_observability(capabilities, infrastructure):
        missing.append("Distributed production requires observability.")
        operational -= 28
    if "kubernetes" in infrastructure:
        deployment -= 10
        operational -= 8
        if not _has_observability(capabilities, infrastructure):
            missing.append("Kubernetes needs monitoring before production hardening.")
    if distributed and not infrastructure & {"docker", "docker_compose", "kubernetes"}:
        missing.append("Distributed deployment needs a container or orchestration baseline.")
        deployment -= 24
    if bool((capabilities | infrastructure) & AI_IDS) and not _has_observability(capabilities, infrastructure):
        missing.append("AI infrastructure needs monitoring and telemetry.")
        operational -= 18
    if "payments" in capabilities and "audit_logs" not in capabilities:
        missing.append("Payments should expose audit logs for production review.")
        operational -= 10
    team_readiness = 88 - max(0, team["team_size"] - 5) * 4
    score = _clamp(round((_clamp(deployment) + _clamp(operational) + _clamp(team_readiness)) / 3) - len(missing) * 3)
    readiness = "enterprise_ready" if score >= 82 and not missing else "production_ready" if score >= 68 else "mvp" if score >= 45 else "prototype"
    return {
        "contractVersion": CONTRACT_VERSION,
        "score": score,
        "readiness": readiness,
        "production_ready": readiness in {"production_ready", "enterprise_ready"},
        "enterprise_ready": readiness == "enterprise_ready",
        "deployment_readiness": _clamp(deployment),
        "operational_readiness": _clamp(operational),
        "team_readiness": _clamp(team_readiness),
        "missing_baselines": _unique(missing),
    }


def detect_human_risks(selection: dict[str, Any]) -> list[dict[str, Any]]:
    normalized = _normalize(selection)
    capabilities = set(normalized["capability_ids"])
    infrastructure = set(normalized["infrastructure_ids"])
    risks: list[dict[str, Any]] = []

    def risk(risk_id: str, title: str, severity: str, category: str, summary: str, related_ids: list[str]) -> None:
        risks.append(
            {
                "contractVersion": CONTRACT_VERSION,
                "id": risk_id,
                "title": title,
                "severity": severity,
                "category": category,
                "summary": summary,
                "related_ids": related_ids,
            }
        )

    if normalized["architecture_id"] == "microservices":
        risk("platform_maturity", "Platform maturity gap", "warning", "team", "Microservices amplify coordination, incident response, and service ownership demands.", ["microservices"])
        if not _has_observability(capabilities, infrastructure):
            risk("distributed_visibility", "Distributed visibility gap", "critical", "operations", "Microservices without observability increase human diagnosis risk.", ["microservices", "observability"])
    if "kubernetes" in infrastructure:
        risk("cluster_operations", "Cluster operations pressure", "warning", "production", "Kubernetes increases release, rollback, and on-call skill requirements.", ["kubernetes"])
    if normalized["framework_id"] == "spring_boot":
        risk("enterprise_onboarding", "Enterprise onboarding load", "info", "maintenance", "Spring Boot conventions require senior backend architecture discipline.", ["spring_boot"])
    if normalized["framework_id"] == "fastapi" and capabilities & {"rag", "ai_chat"}:
        risk("ai_runtime_specialism", "AI runtime specialism", "warning", "team", "FastAPI AI/RAG work needs async Python, AI infra, and vector retrieval knowledge.", ["fastapi", *sorted(capabilities & {"rag", "ai_chat"})])
    if bool((capabilities | infrastructure) & AI_IDS) and not _has_observability(capabilities, infrastructure):
        risk("ai_monitoring_gap", "AI monitoring gap", "warning", "operations", "AI infrastructure without monitoring raises support and quality triage risk.", sorted((capabilities | infrastructure) & AI_IDS))
    return risks


def _normalize(selection: dict[str, Any]) -> dict[str, Any]:
    return {
        "language_id": str(selection.get("language_id") or "").strip(),
        "framework_id": str(selection.get("framework_id") or "").strip(),
        "architecture_id": str(selection.get("architecture_id") or "").strip(),
        "capability_ids": _unique(str(item).strip() for item in selection.get("capability_ids") or []),
        "infrastructure_ids": _unique(str(item).strip() for item in selection.get("infrastructure_ids") or []),
    }


def _skill(skill_id: str, label: str, priority: str, rationale: str) -> dict[str, str]:
    return {"contractVersion": CONTRACT_VERSION, "id": skill_id, "label": label, "priority": priority, "rationale": rationale}


def _role(role_id: str, title: str, level: str, required: list[dict[str, str]], optional: list[dict[str, str]]) -> dict[str, Any]:
    return {
        "contractVersion": CONTRACT_VERSION,
        "id": role_id,
        "title": title,
        "recommended_level": level,
        "required_skills": required,
        "optional_skills": optional,
    }


def _band(score: int) -> str:
    for limit, label in BAND_LIMITS:
        if score < limit:
            return label
    return "enterprise"


def _clamp(value: int) -> int:
    return max(0, min(100, value))


def _has_observability(capabilities: set[str], infrastructure: set[str]) -> bool:
    return bool((capabilities | infrastructure) & OBSERVABILITY_IDS)


def _unique(values: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(item for item in values if item))


def _dedupe_by_id(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    result = []
    for item in items:
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        result.append(item)
    return result
