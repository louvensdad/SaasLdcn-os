from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from fastapi import HTTPException, status

from app.repositories.registry_repository import RegistryRepository

LANGUAGE_DOMAIN_METADATA: dict[str, dict[str, Any]] = {
    "java": {
        "ecosystem": "JVM Enterprise",
        "summary": "Java is the safest choice for governed enterprise systems with a large ecosystem, strong typing and long-term operational stability.",
        "primary_use_cases": [
            "Enterprise APIs",
            "Regulated platforms",
            "Domain-heavy modular systems",
        ],
        "strengths": [
            "Very strong enterprise tooling and observability ecosystem",
            "Excellent fit for large teams and long-lived systems",
            "Natural alignment with modular monolith and distributed backends",
        ],
        "tradeoffs": [
            "Higher learning curve and more ceremony than lighter stacks",
            "Can feel heavy for very small products or rapid prototypes",
            "Startup and runtime cost are more visible than in simpler runtimes",
        ],
        "recommended_for": [
            "Enterprise teams",
            "Platform engineering",
            "Financial and regulated products",
        ],
    },
    "typescript": {
        "ecosystem": "TypeScript Product Platform",
        "summary": "TypeScript is the default choice for modern product delivery across frontend and backend surfaces, with a very strong full-stack ecosystem.",
        "primary_use_cases": [
            "Full-stack web apps",
            "Frontend-heavy products",
            "Modular Node.js backends",
        ],
        "strengths": [
            "One language across frontend and backend reduces context switching",
            "Excellent ecosystem for SaaS, dashboards and product iteration",
            "Strong framework coverage from UI to enterprise backend patterns",
        ],
        "tradeoffs": [
            "Runtime discipline still matters because the language alone does not enforce architecture",
            "Framework sprawl can appear quickly without a clear governance model",
            "High-scale backend work may need stricter operational conventions",
        ],
        "recommended_for": [
            "Product teams",
            "Full-stack delivery",
            "Frontend plus backend shared ownership",
        ],
    },
    "python": {
        "ecosystem": "Python AI/Data",
        "summary": "Python is ideal for API delivery, data workflows and AI-adjacent systems where speed of implementation and ecosystem breadth matter more than raw throughput.",
        "primary_use_cases": [
            "APIs",
            "Data and AI workflows",
            "Automation and backend services",
        ],
        "strengths": [
            "Fast iteration and easy onboarding",
            "Excellent fit for data, AI and RAG-oriented products",
            "Strong API options for both small and structured systems",
        ],
        "tradeoffs": [
            "Raw performance is usually lower than Go or JVM-based stacks",
            "Large systems need deliberate structure to stay maintainable",
            "Packaging and async discipline require attention as the codebase grows",
        ],
        "recommended_for": [
            "AI and data teams",
            "Backend product builders",
            "Automation-heavy applications",
        ],
    },
    "csharp": {
        "ecosystem": ".NET Enterprise",
        "summary": "C# is a high-confidence enterprise option for teams that want strong performance, mature tooling and a clear path to distributed systems.",
        "primary_use_cases": [
            "Enterprise APIs",
            "Internal platforms",
            "Distributed business systems",
        ],
        "strengths": [
            "Excellent tooling and runtime performance in the .NET ecosystem",
            "Strong fit for governed enterprise delivery and clean architecture",
            "Works well for APIs, services and internal web experiences",
        ],
        "tradeoffs": [
            "Can feel heavier than lighter web-first stacks",
            "Blazor and broader .NET UI choices are best when the team is committed to the ecosystem",
            "Small prototypes can be more ceremony-heavy than equivalent scripting stacks",
        ],
        "recommended_for": [
            "Enterprise product teams",
            "Microsoft-aligned organizations",
            "APIs that need strong governance",
        ],
    },
    "php": {
        "ecosystem": "PHP Product Delivery",
        "summary": "PHP remains a strong choice for SaaS, admin and CRUD-heavy delivery where Laravel accelerates business outcomes with a predictable developer experience.",
        "primary_use_cases": [
            "SaaS apps",
            "Admin and CRUD systems",
            "Commerce and marketplace products",
        ],
        "strengths": [
            "Laravel offers a productive path for web delivery and business features",
            "Excellent for teams that want fast feature throughput",
            "A solid fit for classic product systems with queues and auth needs",
        ],
        "tradeoffs": [
            "Long-lived systems need clear architectural guardrails",
            "Performance and distributed concerns need early planning beyond the happy path",
            "Ecosystem consistency varies more than in some enterprise-first stacks",
        ],
        "recommended_for": [
            "SaaS builders",
            "Marketplace teams",
            "CRUD-heavy delivery teams",
        ],
    },
    "go": {
        "ecosystem": "Go Cloud Services",
        "summary": "Go is the default when low latency, operational simplicity and service-oriented delivery matter more than framework richness.",
        "primary_use_cases": [
            "Low-latency APIs",
            "Microservices",
            "Infrastructure and service backends",
        ],
        "strengths": [
            "High throughput and efficient runtime behavior",
            "Excellent deployment simplicity for service backends",
            "Strong fit for gRPC, distributed systems and lean infrastructure",
        ],
        "tradeoffs": [
            "Less batteries-included for product-heavy UI work",
            "Teams may need to assemble more conventions themselves",
            "Expressiveness can feel more constrained for very large domain models",
        ],
        "recommended_for": [
            "Platform teams",
            "Distributed service owners",
            "Latency-sensitive backends",
        ],
    },
}

LANGUAGE_DOMAIN_RECOMMENDATIONS: dict[str, list[dict[str, str]]] = {
    "java": [
        {
            "id": "spring_boot_enterprise_apis",
            "title": "Use Spring Boot for enterprise APIs",
            "summary": "Spring Boot is the primary recommendation for governed Java APIs, internal platforms and business-critical services.",
            "priority": "primary",
        },
        {
            "id": "modular_monolith_start",
            "title": "Start with a modular monolith",
            "summary": "A modular monolith is the best default when you want professional structure without premature distribution.",
            "priority": "primary",
        },
        {
            "id": "microservices_advanced_only",
            "title": "Move to microservices only when advanced",
            "summary": "Spring Cloud and microservices should come later, once team maturity and operational needs justify the cost.",
            "priority": "advanced",
        },
        {
            "id": "enterprise_platform_stack",
            "title": "Add Kafka, Redis and observability for enterprise scale",
            "summary": "Messaging, caching and observability become the enterprise baseline once the product reaches distributed pressure.",
            "priority": "secondary",
        },
        {
            "id": "keycloak_future_auth",
            "title": "Plan Keycloak for future enterprise identity",
            "summary": "Keycloak is the recommended future auth layer for organizations that need external identity governance in Java ecosystems.",
            "priority": "future",
        },
    ],
    "typescript": [
        {
            "id": "nextjs_fullstack_default",
            "title": "Use Next.js for full-stack and frontend delivery",
            "summary": "Next.js is the default recommendation for product surfaces, web apps and full-stack TypeScript delivery.",
            "priority": "primary",
        },
        {
            "id": "nestjs_backend_enterprise",
            "title": "Use NestJS for enterprise backend structure",
            "summary": "NestJS is the strongest choice when the TypeScript domain needs modular backend governance.",
            "priority": "primary",
        },
        {
            "id": "light_api_choices",
            "title": "Keep Express or Fastify for lighter APIs",
            "summary": "Express and Fastify are best when the team wants simple APIs without a heavier domain framework.",
            "priority": "secondary",
        },
        {
            "id": "frontend_framework_choices",
            "title": "Use React or Angular for frontend specialization",
            "summary": "React and Angular remain valid when the domain is frontend-centric and the runtime graph should stay on Node.js.",
            "priority": "secondary",
        },
        {
            "id": "node_default_runtime",
            "title": "Keep Node.js as the default runtime",
            "summary": "Node.js is the default runtime for the TypeScript domain unless a specialized deployment reason says otherwise.",
            "priority": "primary",
        },
    ],
    "python": [
        {
            "id": "fastapi_modern_api",
            "title": "Use FastAPI for modern APIs",
            "summary": "FastAPI is the default recommendation for typed, modern API delivery in Python.",
            "priority": "primary",
        },
        {
            "id": "django_full_system",
            "title": "Use Django for complete systems",
            "summary": "Django is the best choice when the product needs admin, auth and a batteries-included delivery model.",
            "priority": "primary",
        },
        {
            "id": "flask_small_services",
            "title": "Use Flask for small services",
            "summary": "Flask stays valuable for lightweight services and simple foundations that do not need a larger framework.",
            "priority": "secondary",
        },
        {
            "id": "celery_redis_jobs",
            "title": "Pair Celery with Redis for jobs",
            "summary": "Celery plus Redis is the recommended background execution layer for Python domains with asynchronous work.",
            "priority": "secondary",
        },
        {
            "id": "rag_ai_data_strength",
            "title": "Leverage RAG, AI and data pipelines",
            "summary": "Python is especially strong for RAG, AI and data pipelines, so these should be treated as first-class domain advantages.",
            "priority": "future",
        },
    ],
    "csharp": [
        {
            "id": "aspnet_core_enterprise",
            "title": "Use ASP.NET Core for enterprise APIs",
            "summary": "ASP.NET Core is the core recommendation for governed .NET APIs and services.",
            "priority": "primary",
        },
        {
            "id": "blazor_frontend_option",
            "title": "Use Blazor for .NET frontend delivery",
            "summary": "Blazor is the strongest frontend option when the team wants to stay inside the .NET ecosystem.",
            "priority": "secondary",
        },
        {
            "id": "clean_architecture_default",
            "title": "Default to Clean Architecture for professional work",
            "summary": "Clean Architecture is the default structural recommendation once the C# domain moves beyond MVP level.",
            "priority": "primary",
        },
        {
            "id": "identity_and_auth",
            "title": "Use Identity for auth and gRPC for distributed delivery",
            "summary": "Identity gives the auth baseline, while gRPC is the preferred enterprise integration path for distributed systems.",
            "priority": "secondary",
        },
        {
            "id": "distributed_enterprise_path",
            "title": "Plan for distributed enterprise delivery",
            "summary": "C# becomes especially strong when the roadmap includes enterprise APIs, service boundaries and cloud-scale coordination.",
            "priority": "future",
        },
    ],
    "php": [
        {
            "id": "laravel_saas_default",
            "title": "Use Laravel for SaaS and CRUD delivery",
            "summary": "Laravel is the primary recommendation for SaaS, CRUD-heavy apps, admin panels and marketplaces.",
            "priority": "primary",
        },
        {
            "id": "queues_and_jobs",
            "title": "Use queues and jobs as a professional baseline",
            "summary": "Queues and background jobs should be treated as standard once PHP systems become professional-grade.",
            "priority": "secondary",
        },
        {
            "id": "sanctum_or_passport",
            "title": "Use Sanctum or Passport for auth",
            "summary": "Sanctum or Passport should handle identity depending on whether the system is cookie-based or API-centric.",
            "priority": "secondary",
        },
        {
            "id": "filament_admin_future",
            "title": "Plan Filament for future admin surfaces",
            "summary": "Filament is a strong future option for internal admin and operational tooling in the PHP ecosystem.",
            "priority": "future",
        },
        {
            "id": "commerce_ready",
            "title": "Treat commerce and marketplace flows as first-class",
            "summary": "PHP should be positioned confidently for SaaS commerce and marketplace delivery when the product needs quick business throughput.",
            "priority": "primary",
        },
    ],
    "go": [
        {
            "id": "gin_or_fiber_default",
            "title": "Use Gin or Fiber for performant APIs",
            "summary": "Gin and Fiber are the default Go choices when low-latency APIs and lean service surfaces matter.",
            "priority": "primary",
        },
        {
            "id": "microservices_event_driven",
            "title": "Use microservices and event-driven design at advanced levels",
            "summary": "Go is especially effective once the architecture needs distributed service boundaries and asynchronous coordination.",
            "priority": "advanced",
        },
        {
            "id": "grpc_first",
            "title": "Use gRPC as a strong enterprise transport",
            "summary": "gRPC should be the preferred enterprise transport when Go services need typed service-to-service contracts.",
            "priority": "secondary",
        },
        {
            "id": "low_latency_focus",
            "title": "Optimize for low latency and operational simplicity",
            "summary": "Go should be positioned around low latency, predictable deployments and compact operational overhead.",
            "priority": "primary",
        },
        {
            "id": "platform_team_fit",
            "title": "Reserve Go for platform and service owners",
            "summary": "Go is best when the team owns platform code, infrastructure services or distributed backends rather than UI-heavy products.",
            "priority": "future",
        },
    ],
}


class LanguageDomainService:
    def __init__(self, repository: RegistryRepository | None = None) -> None:
        self.repository = repository or RegistryRepository()

    def get_language_profile(self, language_id: str) -> dict[str, Any]:
        language = self._get_language(language_id)
        frameworks = self.get_language_frameworks(language_id)
        architectures = self.get_language_architectures(language_id)
        capabilities = self.get_language_capabilities(language_id)
        metadata = LANGUAGE_DOMAIN_METADATA[language_id]

        return {
            "language_id": language["id"],
            "name": language["name"],
            "ecosystem": metadata["ecosystem"],
            "summary": metadata["summary"],
            "primary_use_cases": list(metadata["primary_use_cases"]),
            "strengths": list(metadata["strengths"]),
            "tradeoffs": list(metadata["tradeoffs"]),
            "recommended_for": list(metadata["recommended_for"]),
            "framework_count": len(frameworks),
            "architecture_count": len(architectures),
            "capability_count": len(capabilities),
            "enterprise_score": language["enterprise_score"],
            "learning_curve": language["learning_curve"],
            "scalability_profile": language["scalability_profile"],
        }

    def get_language_frameworks(self, language_id: str) -> list[dict[str, Any]]:
        language = self._get_language(language_id)
        supported_framework_ids = set(language["supported_frameworks"])
        return [
            item
            for item in self.repository.list_frameworks()
            if item["id"] in supported_framework_ids
        ]

    def get_language_architectures(self, language_id: str) -> list[dict[str, Any]]:
        language = self._get_language(language_id)
        supported_architecture_ids = set(language["supported_architectures"])
        supported_framework_ids = set(language["supported_frameworks"])
        return [
            item
            for item in self.repository.list_architectures()
            if item["id"] in supported_architecture_ids
            and any(framework_id in supported_framework_ids for framework_id in item["supported_frameworks"])
        ]

    def get_language_archetypes(self, language_id: str) -> list[dict[str, Any]]:
        framework_ids = {item["id"] for item in self.get_language_frameworks(language_id)}
        architecture_ids = {item["id"] for item in self.get_language_architectures(language_id)}
        return [
            item
            for item in self.repository.list_archetypes()
            if framework_ids.intersection(item["supported_frameworks"])
            and architecture_ids.intersection(item["supported_architectures"])
        ]

    def get_language_capabilities(self, language_id: str) -> list[dict[str, Any]]:
        framework_ids = {item["id"] for item in self.get_language_frameworks(language_id)}
        architecture_ids = {item["id"] for item in self.get_language_architectures(language_id)}
        return [
            item
            for item in self.repository.list_capabilities()
            if framework_ids.intersection(item["supported_frameworks"])
            and architecture_ids.intersection(item["architecture_ids"])
        ]

    def get_language_recommendations(self, language_id: str) -> list[dict[str, Any]]:
        self._get_language(language_id)
        recommendations = LANGUAGE_DOMAIN_RECOMMENDATIONS[language_id]
        return [
            {
                "language_id": language_id,
                **item,
            }
            for item in recommendations
        ]

    def _get_language(self, language_id: str) -> dict[str, Any]:
        language = next((item for item in self.repository.list_languages() if item["id"] == language_id), None)
        if language is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Language '{language_id}' was not found.",
            )
        if language_id not in LANGUAGE_DOMAIN_METADATA:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Language '{language_id}' was not found.",
            )
        return language
