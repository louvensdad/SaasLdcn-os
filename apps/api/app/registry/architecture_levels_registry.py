from __future__ import annotations

from collections.abc import Sequence

ARCHITECTURE_LEVELS: list[dict] = [
    {
        "id": "level_1_mvp",
        "name": "Level 1 MVP",
        "description": "Simple structure, minimal dependencies and local-first setup.",
        "complexity_score": 1,
        "recommended_for": ["quick validation", "small teams", "local-first prototypes"],
        "includes": ["simple structure", "minimal dependencies", "basic validation", "local-first"],
        "constraints": ["avoid distributed assumptions", "keep modules minimal"],
        "supported_stacks": ["static_site", "nextjs", "react", "angular", "fastapi", "spring_boot", "nestjs"],
        "required_capabilities": [],
        "optional_capabilities": ["seo", "i18n", "api_docs"],
    },
    {
        "id": "level_2_professional",
        "name": "Level 2 Professional",
        "description": "Modular baseline with auth, tests, docs and stronger application readiness.",
        "complexity_score": 2,
        "recommended_for": ["professional products", "authenticated apps", "small SaaS"],
        "includes": ["modular structure", "auth", "database", "tests", "docs"],
        "constraints": ["docker optional", "avoid distributed overhead unless justified"],
        "supported_stacks": ["nextjs", "react", "angular", "fastapi", "spring_boot", "nestjs"],
        "required_capabilities": [],
        "optional_capabilities": ["authentication", "api_docs", "analytics", "docker"],
    },
    {
        "id": "level_3_enterprise",
        "name": "Level 3 Enterprise",
        "description": "Governed architecture with audit, observability and enterprise safety controls.",
        "complexity_score": 3,
        "recommended_for": ["regulated domains", "enterprise products", "multi-team systems"],
        "includes": ["rbac", "audit logs", "observability", "cache"],
        "constraints": ["queues optional", "docker recommended", "validation must be explicit"],
        "supported_stacks": ["nextjs", "fastapi", "spring_boot", "nestjs"],
        "required_capabilities": [],
        "optional_capabilities": ["rbac", "multi_tenancy", "queue", "docker", "observability", "cache"],
    },
    {
        "id": "level_4_distributed",
        "name": "Level 4 Distributed",
        "description": "Distributed service architecture with boundaries, messaging and delivery automation.",
        "complexity_score": 4,
        "recommended_for": ["microservices", "high throughput systems", "multi-service platforms"],
        "includes": ["microservices", "gateway", "messaging", "distributed tracing", "service boundaries", "CI/CD"],
        "constraints": ["requires operational maturity", "avoid if modular monolith is enough"],
        "supported_stacks": ["fastapi", "spring_boot", "nestjs", "nextjs"],
        "required_capabilities": ["docker", "observability"],
        "optional_capabilities": ["queue", "cache", "ci_cd", "rate_limiting"],
    },
    {
        "id": "level_5_hyperscale",
        "name": "Level 5 Hyperscale",
        "description": "Hyperscale-oriented architecture with platform-level operational expectations.",
        "complexity_score": 5,
        "recommended_for": ["large distributed platforms", "multi-region systems", "extreme scale programs"],
        "includes": ["Kubernetes", "autoscaling", "multi-region readiness"],
        "constraints": ["event sourcing optional", "service mesh optional", "advanced observability required"],
        "supported_stacks": ["fastapi", "spring_boot", "nestjs"],
        "required_capabilities": ["docker", "observability", "ci_cd"],
        "optional_capabilities": ["queue", "cache", "rate_limiting"],
    },
]


def get_architecture_levels_registry() -> Sequence[dict]:
    return ARCHITECTURE_LEVELS
