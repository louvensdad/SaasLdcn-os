from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from fastapi import HTTPException, status

from app.data.foundation import CONTRACT_VERSION
from app.repositories.registry_repository import RegistryRepository

FRAMEWORK_SPECIALIST_DATA: dict[str, dict[str, Any]] = {
    "spring_boot": {
        "specialist_label": "Enterprise Java backbone",
        "summary": "Spring Boot is the safest enterprise default for governed Java backends that need modularity, clear observability and a long service life.",
        "best_for": [
            "enterprise APIs",
            "modular monoliths",
            "microservices with strong governance",
        ],
        "avoid_when": [
            "the project is a quick frontend-only prototype",
            "the team is not ready for JVM operational discipline",
            "the product needs very little backend ceremony",
        ],
        "recommended_architectures": [
            {
                "architecture_id": "modular_monolith",
                "architecture_name": "Modular monolith",
                "summary": "The safest default for strong boundaries without distributed complexity.",
                "rationale": "Keeps business domains isolated while preserving a simple deployment model.",
                "tradeoff": "Requires discipline in package boundaries and module ownership.",
            },
            {
                "architecture_id": "microservices",
                "architecture_name": "Microservices",
                "summary": "Best when the team already has operational maturity and clear service boundaries.",
                "rationale": "Spring Boot plus Spring ecosystem support service decomposition and infrastructure-heavy delivery.",
                "tradeoff": "Adds coordination, deployment and observability cost quickly.",
            },
            {
                "architecture_id": "clean_architecture",
                "architecture_name": "Clean architecture",
                "summary": "A strong fit for enterprise business rules that must stay stable over time.",
                "rationale": "Encourages explicit application, domain and infrastructure boundaries.",
                "tradeoff": "Adds abstraction layers that can feel heavy for small teams.",
            },
        ],
        "supported_archetypes": [
            "rest_api",
            "async_api",
            "microservice_api",
            "banking_api",
            "healthcare_api",
            "integration_api",
            "erp",
            "marketplace",
            "ai_saas",
        ],
        "recommended_capabilities": [
            {
                "capability_id": "authentication",
                "summary": "Use Spring Security as the baseline identity boundary.",
                "rationale": "Enterprise systems should treat auth as a first-class concern from the beginning.",
                "priority": "core",
            },
            {
                "capability_id": "rbac",
                "summary": "Add role-based authorization for domain and admin surfaces.",
                "rationale": "Governed Java systems usually need fine-grained access control.",
                "priority": "core",
            },
            {
                "capability_id": "api_docs",
                "summary": "Publish contract-first API documentation from the backend.",
                "rationale": "Strong documentation improves cross-team delivery and review quality.",
                "priority": "recommended",
            },
            {
                "capability_id": "observability",
                "summary": "Instrument metrics, tracing and structured logs early.",
                "rationale": "Spring Boot is strongest when operations are visible rather than inferred.",
                "priority": "core",
            },
            {
                "capability_id": "docker",
                "summary": "Package the service for repeatable local and production runs.",
                "rationale": "Containerized delivery keeps JVM services portable and reproducible.",
                "priority": "recommended",
            },
            {
                "capability_id": "queue",
                "summary": "Use asynchronous queues for non-blocking business workflows.",
                "rationale": "Spring systems often benefit from background processing and retries.",
                "priority": "recommended",
            },
            {
                "capability_id": "cache",
                "summary": "Cache hot reads and expensive computations.",
                "rationale": "Enterprise workloads usually need predictable latency under load.",
                "priority": "optional",
            },
        ],
        "recommended_business_modules": ["users", "orders", "payments", "audit", "settings", "reports"],
        "recommended_endpoint_groups": [
            {
                "endpoint_group": "auth",
                "title": "Identity and session APIs",
                "summary": "Login, session renewal and current user routes should be the first structured surface.",
                "recommended_endpoints": ["auth.login", "auth.refresh", "auth.me", "auth.logout"],
            },
            {
                "endpoint_group": "orders",
                "title": "Order and payment workflows",
                "summary": "Order lifecycle and payment orchestration are natural Spring Boot strengths.",
                "recommended_endpoints": ["orders.list", "orders.create", "orders.update_status", "payments.create", "payments.webhook"],
            },
            {
                "endpoint_group": "admin",
                "title": "Governance and audit routes",
                "summary": "Administrative settings and audit review should remain explicit and observable.",
                "recommended_endpoints": ["admin.settings", "admin.audit_logs"],
            },
            {
                "endpoint_group": "analytics",
                "title": "Operational reporting",
                "summary": "Analytics routes become useful once the domain needs traceability and product insight.",
                "recommended_endpoints": ["analytics.overview", "analytics.revenue", "analytics.activity"],
            },
        ],
        "tradeoffs": [
            {
                "title": "Higher ceremony",
                "summary": "Spring Boot gives structure, but the framework expects disciplined patterns and configuration.",
                "impact": "medium",
            },
            {
                "title": "Microservices temptation",
                "summary": "The ecosystem makes distributed systems easy to imagine before the organization is ready to operate them.",
                "impact": "high",
            },
            {
                "title": "Observability debt",
                "summary": "A Spring service without logging, metrics and tracing becomes expensive to debug at scale.",
                "impact": "high",
            },
        ],
        "testing_strategy": [
            "unit test domain services and policy logic",
            "use integration tests for persistence and security boundaries",
            "cover contract tests for public endpoints",
            "validate smoke tests for container startup and health checks",
        ],
        "security_baseline": [
            "Spring Security",
            "JWT or OAuth2",
            "request validation",
            "audit logs",
            "least privilege roles",
        ],
        "deployment_baseline": [
            "containerize the service",
            "externalize configuration",
            "separate build and runtime profiles",
            "use blue-green or rolling deployment patterns",
        ],
        "observability_baseline": [
            "structured application logs",
            "metrics on latency and error rate",
            "distributed tracing for service boundaries",
            "health and readiness endpoints",
        ],
        "common_pitfalls": [
            "moving to microservices too early",
            "overengineering module abstractions",
            "missing observability until production pressure appears",
        ],
        "complexity_notes": [
            "Best when the team accepts enterprise structure as a feature rather than overhead.",
            "The architecture scales well, but only if module ownership stays strict.",
        ],
        "readiness_profile": {
            "level": "enterprise",
            "label": "Enterprise ready",
            "summary": "Spring Boot is ready for governed production backends once the team has a clear module boundary and operational baseline.",
            "signals": [
                "The domain needs durability and team-scale ownership.",
                "The platform expects auth, audit and observability from day one.",
                "The team can support JVM operations and release discipline.",
            ],
            "risks": [
                "The system may become over-abstracted if the team starts with distributed services.",
                "Operational maturity must stay visible in logs, metrics and tracing.",
            ],
            "next_steps": [
                "Start as a modular monolith.",
                "Add security and observability before feature breadth.",
                "Introduce queue and cache only where they solve a concrete bottleneck.",
            ],
            "score": 96,
        },
    },
    "nestjs": {
        "specialist_label": "TypeScript backend governance",
        "summary": "NestJS is the default TypeScript backend specialist for modular SaaS systems, enterprise APIs and event-driven server work.",
        "best_for": [
            "TypeScript enterprise APIs",
            "modular SaaS backends",
            "AI SaaS service layers",
        ],
        "avoid_when": [
            "the team wants an ultra-minimal HTTP layer",
            "module boundaries will not be actively maintained",
            "the product needs only a tiny integration glue service",
        ],
        "recommended_architectures": [
            {
                "architecture_id": "modular_monolith",
                "architecture_name": "Modular monolith",
                "summary": "The strongest default when product velocity matters more than service splitting.",
                "rationale": "NestJS modules and providers naturally support bounded domain separation.",
                "tradeoff": "Requires clear ownership to avoid module sprawl.",
            },
            {
                "architecture_id": "microservices",
                "architecture_name": "Microservices",
                "summary": "A valid advanced choice when the team is ready for distributed service ownership.",
                "rationale": "NestJS has strong support for message-driven service composition.",
                "tradeoff": "Adds orchestration and deployment overhead.",
            },
            {
                "architecture_id": "event_driven",
                "architecture_name": "Event-driven",
                "summary": "A fit for SaaS domains that need decoupled workflows and asynchronous reactions.",
                "rationale": "Events fit NestJS's module and queue-first backend style.",
                "tradeoff": "Event contracts and observability must be managed carefully.",
            },
        ],
        "supported_archetypes": [
            "rest_api",
            "async_api",
            "microservice_api",
            "realtime_api",
            "integration_api",
            "ai_saas",
            "ai_agent_platform",
            "rag_system",
            "automation_agent",
            "saas_dashboard",
            "marketplace",
        ],
        "recommended_capabilities": [
            {
                "capability_id": "authentication",
                "summary": "Use auth guards and dedicated auth modules.",
                "rationale": "NestJS shines when identity is handled in a structured module layer.",
                "priority": "core",
            },
            {
                "capability_id": "rbac",
                "summary": "Protect domain routes with explicit roles and permissions.",
                "rationale": "Enterprise TypeScript backends usually need predictable authorization boundaries.",
                "priority": "core",
            },
            {
                "capability_id": "queue",
                "summary": "Move asynchronous work into jobs and workers.",
                "rationale": "Queue-driven delivery matches NestJS service composition well.",
                "priority": "recommended",
            },
            {
                "capability_id": "websocket",
                "summary": "Use websocket gateways for live product surfaces.",
                "rationale": "Realtime SaaS systems often need bidirectional communication.",
                "priority": "recommended",
            },
            {
                "capability_id": "api_docs",
                "summary": "Generate clear API docs for teams and consumers.",
                "rationale": "NestJS is strongest when contract visibility is easy to share.",
                "priority": "recommended",
            },
            {
                "capability_id": "observability",
                "summary": "Track logs, metrics and traces per module and worker.",
                "rationale": "Structured modules need structured visibility.",
                "priority": "core",
            },
        ],
        "recommended_business_modules": ["users", "orders", "payments", "notifications", "reports", "settings"],
        "recommended_endpoint_groups": [
            {
                "endpoint_group": "auth",
                "title": "Identity and session APIs",
                "summary": "Auth modules should stay isolated and composable.",
                "recommended_endpoints": ["auth.login", "auth.refresh", "auth.me", "auth.logout"],
            },
            {
                "endpoint_group": "realtime",
                "title": "Live interaction surfaces",
                "summary": "Websocket and realtime routes fit NestJS well.",
                "recommended_endpoints": ["analytics.activity", "notifications.stream"],
            },
            {
                "endpoint_group": "ai",
                "title": "AI and retrieval endpoints",
                "summary": "AI SaaS backends should separate model interaction from application logic.",
                "recommended_endpoints": ["ai.chat", "ai.embeddings"],
            },
            {
                "endpoint_group": "admin",
                "title": "Governance and control",
                "summary": "Administration and audit routes help preserve module discipline.",
                "recommended_endpoints": ["admin.settings", "admin.audit_logs"],
            },
        ],
        "tradeoffs": [
            {
                "title": "Weak module boundaries",
                "summary": "NestJS becomes messy quickly when controllers hold business logic or modules leak across responsibilities.",
                "impact": "high",
            },
            {
                "title": "Decorator-heavy surface",
                "summary": "The framework is expressive, but the abstraction layer can hide runtime behavior from the team.",
                "impact": "medium",
            },
            {
                "title": "Over-distribution risk",
                "summary": "The framework is ready for microservices, but the organization may not be ready to run them.",
                "impact": "high",
            },
        ],
        "testing_strategy": [
            "unit test providers and services before controllers",
            "use integration tests for guards, pipes and interceptors",
            "cover event and queue flows with worker tests",
            "include contract tests for public routes",
        ],
        "security_baseline": [
            "NestJS guards",
            "JWT or OAuth2",
            "role-based route guards",
            "request validation pipes",
            "audit trails",
        ],
        "deployment_baseline": [
            "run as containers by default",
            "separate worker and API deployments",
            "externalize queue and cache settings",
            "keep health probes explicit",
        ],
        "observability_baseline": [
            "module-scoped structured logs",
            "queue and worker visibility",
            "request timing and error metrics",
            "distributed tracing across services",
        ],
        "common_pitfalls": [
            "business logic in controllers",
            "weak module boundaries",
            "ignoring asynchronous failure paths",
        ],
        "complexity_notes": [
            "Excellent for teams that want TypeScript discipline without sacrificing modularity.",
            "The framework rewards explicit boundaries and consistent dependency injection rules.",
        ],
        "readiness_profile": {
            "level": "enterprise",
            "label": "Architecture ready",
            "summary": "NestJS is ready when the team wants a structured TypeScript backend with clear service boundaries and a strong path to scale.",
            "signals": [
                "The team needs modular product growth.",
                "Queue, websocket and auth are part of the roadmap.",
                "The backend must stay aligned with TypeScript end-to-end.",
            ],
            "risks": [
                "Controllers can become dumping grounds if modules are not governed.",
                "Too many distributed patterns too early will slow delivery.",
            ],
            "next_steps": [
                "Start with a modular monolith.",
                "Keep business logic in services and domain layers.",
                "Add queue, websocket and observability only where the domain needs them.",
            ],
            "score": 94,
        },
    },
    "nextjs": {
        "specialist_label": "Full-stack web delivery",
        "summary": "Next.js is the best specialist for SaaS frontends, dashboards and full-stack product surfaces that need SEO, routing and fast iteration.",
        "best_for": [
            "SaaS frontend delivery",
            "landing pages and marketing sites",
            "dashboards and product shells",
        ],
        "avoid_when": [
            "you are generating a backend-only API surface",
            "the team wants a pure server-side backend framework",
            "client/server boundaries will not be explicitly owned",
        ],
        "recommended_architectures": [
            {
                "architecture_id": "fullstack_app",
                "architecture_name": "Full-stack app",
                "summary": "The default for products that want frontend and backend coordination in one codebase.",
                "rationale": "Next.js handles UI, server routes and delivery concerns in one workflow.",
                "tradeoff": "The codebase needs discipline to keep server and client concerns separated.",
            },
            {
                "architecture_id": "frontend_bff",
                "architecture_name": "Frontend BFF",
                "summary": "A strong fit when the UI needs a backend-for-frontend layer.",
                "rationale": "Next.js server routes can shape data specifically for the client experience.",
                "tradeoff": "Can duplicate business logic if the BFF becomes too capable.",
            },
            {
                "architecture_id": "edge_rendered",
                "architecture_name": "Edge rendered",
                "summary": "Useful for latency-sensitive experiences that benefit from edge placement.",
                "rationale": "Next.js supports modern rendering patterns for fast first paint and SEO.",
                "tradeoff": "Edge constraints can limit implementation choices.",
            },
        ],
        "supported_archetypes": [
            "landing_page",
            "institutional_site",
            "portfolio",
            "blog",
            "sales_page",
            "catalog_site",
            "documentation_site",
            "saas_dashboard",
            "admin_panel",
            "crm",
            "ecommerce",
            "marketplace",
            "booking_system",
            "elearning_platform",
            "ai_saas",
            "chatbot_platform",
        ],
        "recommended_capabilities": [
            {
                "capability_id": "seo",
                "summary": "Use metadata, routing and rendering to maximize discoverability.",
                "rationale": "SEO is one of Next.js's clearest strengths.",
                "priority": "core",
            },
            {
                "capability_id": "authentication",
                "summary": "Protect client and server surfaces with a shared auth model.",
                "rationale": "Most SaaS frontends need authenticated session handling.",
                "priority": "recommended",
            },
            {
                "capability_id": "analytics",
                "summary": "Track product and campaign behavior in the UI layer.",
                "rationale": "Next.js is often the user-facing surface for product analytics.",
                "priority": "recommended",
            },
            {
                "capability_id": "i18n",
                "summary": "Prepare the UI for multilingual rollout.",
                "rationale": "Global product surfaces need locale-aware routing and content.",
                "priority": "optional",
            },
            {
                "capability_id": "pwa",
                "summary": "Add offline-friendly and installable experience where needed.",
                "rationale": "Product surfaces can benefit from progressive web app behavior.",
                "priority": "optional",
            },
        ],
        "recommended_business_modules": ["users", "products", "reports", "settings", "notifications"],
        "recommended_endpoint_groups": [
            {
                "endpoint_group": "auth",
                "title": "Login and session handoff",
                "summary": "Frontend and server routes should share a stable session model.",
                "recommended_endpoints": ["auth.login", "auth.me", "auth.logout"],
            },
            {
                "endpoint_group": "products",
                "title": "Catalog and listing surfaces",
                "summary": "Product browsing and search routes are common Next.js touchpoints.",
                "recommended_endpoints": ["products.list", "products.detail"],
            },
            {
                "endpoint_group": "analytics",
                "title": "Product analytics",
                "summary": "Dashboards benefit from direct access to overview and activity endpoints.",
                "recommended_endpoints": ["analytics.overview", "analytics.activity"],
            },
            {
                "endpoint_group": "admin",
                "title": "Administrative views",
                "summary": "Control surfaces should remain explicit and role-aware.",
                "recommended_endpoints": ["admin.settings", "admin.audit_logs"],
            },
        ],
        "tradeoffs": [
            {
                "title": "Client and server confusion",
                "summary": "Mixing server and client components without a clear boundary creates fragile code.",
                "impact": "high",
            },
            {
                "title": "Client component creep",
                "summary": "Overusing client components makes the app heavier than it needs to be.",
                "impact": "medium",
            },
            {
                "title": "Backend overreach",
                "summary": "Next.js server routes are excellent for BFF work, but they should not become a general backend substitute by default.",
                "impact": "medium",
            },
        ],
        "testing_strategy": [
            "unit test components and hooks",
            "use route-level integration tests for server actions and API routes",
            "cover accessibility and navigation flows in browser tests",
            "validate rendering and hydration behavior on critical pages",
        ],
        "security_baseline": [
            "session-safe auth handling",
            "secure cookie or token transport",
            "server-side validation for sensitive operations",
            "role-aware routing and data access",
        ],
        "deployment_baseline": [
            "support static and server rendering where appropriate",
            "separate public UI and protected app surfaces",
            "keep environment configuration explicit",
            "treat edge deployment as an optimization, not a requirement",
        ],
        "observability_baseline": [
            "client-side error capture",
            "server route metrics",
            "web vitals and page timing",
            "deployment health probes",
        ],
        "common_pitfalls": [
            "mixing server and client components incorrectly",
            "overusing client components",
            "building backend-only logic inside a frontend framework",
        ],
        "complexity_notes": [
            "Great for full-stack product teams that want one system for UI and server orchestration.",
            "Needs discipline when the app grows across both browser and server execution paths.",
        ],
        "readiness_profile": {
            "level": "practical",
            "label": "Product ready",
            "summary": "Next.js is ready when the team wants a modern product surface with SEO, routing and a shared frontend/backend delivery flow.",
            "signals": [
                "The product is UI-driven and shipping fast.",
                "SEO, analytics or server rendering are part of the value path.",
                "The team can maintain client/server separation discipline.",
            ],
            "risks": [
                "Client components can spread without guardrails.",
                "A Next.js app can drift into backend sprawl if BFF scope is not defined.",
            ],
            "next_steps": [
                "Keep server components by default.",
                "Use BFF endpoints only for UI shaping.",
                "Introduce shared route discipline for auth and analytics.",
            ],
            "score": 91,
        },
    },
    "express": {
        "specialist_label": "Minimal Node API surface",
        "summary": "Express is the specialist for lightweight HTTP glue, custom integrations and thin APIs that do not need heavier framework orchestration.",
        "best_for": [
            "simple APIs",
            "integration layers",
            "edge glue services",
        ],
        "avoid_when": [
            "the project needs a strongly opinionated backend structure",
            "the team wants module boundaries enforced by the framework",
            "the domain requires large-scale governance from day one",
        ],
        "recommended_architectures": [
            {
                "architecture_id": "monolith",
                "architecture_name": "Monolith",
                "summary": "The simplest path for glue services and small APIs.",
                "rationale": "Express is most valuable when the service stays compact and direct.",
                "tradeoff": "The team must build its own structure and conventions.",
            },
            {
                "architecture_id": "modular_monolith",
                "architecture_name": "Modular monolith",
                "summary": "Use this when the API is growing and needs a little more discipline.",
                "rationale": "A modular layout prevents route and middleware sprawl.",
                "tradeoff": "Still requires homegrown conventions.",
            },
            {
                "architecture_id": "serverless",
                "architecture_name": "Serverless",
                "summary": "Useful for thin integration endpoints and event handlers.",
                "rationale": "Express can stay lean inside serverless delivery models.",
                "tradeoff": "Stateful or long-lived processing is a poor fit.",
            },
        ],
        "supported_archetypes": ["rest_api", "integration_api"],
        "recommended_capabilities": [
            {
                "capability_id": "authentication",
                "summary": "Protect route groups with explicit middleware.",
                "rationale": "Express needs deliberate auth design because the framework stays minimal.",
                "priority": "core",
            },
            {
                "capability_id": "api_docs",
                "summary": "Document the routes clearly because the framework will not do it for you.",
                "rationale": "Docs are essential when the service is small and custom.",
                "priority": "recommended",
            },
            {
                "capability_id": "rate_limiting",
                "summary": "Add throttling for public endpoints.",
                "rationale": "Minimal APIs need protection against noisy or abusive traffic.",
                "priority": "recommended",
            },
            {
                "capability_id": "docker",
                "summary": "Package the glue service consistently.",
                "rationale": "Express is often deployed as a narrow integration layer.",
                "priority": "optional",
            },
        ],
        "recommended_business_modules": ["users", "reports"],
        "recommended_endpoint_groups": [
            {
                "endpoint_group": "integration",
                "title": "Integration endpoints",
                "summary": "Thin request handlers are the strongest Express use case.",
                "recommended_endpoints": ["users.list", "products.list"],
            },
            {
                "endpoint_group": "auth",
                "title": "Authentication endpoints",
                "summary": "Express can host auth when the rest of the system stays lightweight.",
                "recommended_endpoints": ["auth.login", "auth.me"],
            },
        ],
        "tradeoffs": [
            {
                "title": "No opinionated structure",
                "summary": "The team has to decide routing, service and validation conventions themselves.",
                "impact": "medium",
            },
            {
                "title": "Middleware sprawl",
                "summary": "As the app grows, route-level middleware can become hard to reason about.",
                "impact": "medium",
            },
            {
                "title": "Maintainability depends on discipline",
                "summary": "Express stays fast because it stays small, but that means the team must keep the shape clean.",
                "impact": "high",
            },
        ],
        "testing_strategy": [
            "unit test service functions and middleware",
            "cover integration paths with API tests",
            "verify error handling around external systems",
            "keep contract tests close to public routes",
        ],
        "security_baseline": [
            "middleware-based authentication",
            "request validation",
            "throttling and rate limits",
            "secure headers",
        ],
        "deployment_baseline": [
            "small container image",
            "stateless runtime assumptions",
            "clear environment-specific configuration",
            "health endpoint and process supervision",
        ],
        "observability_baseline": [
            "structured logs",
            "route latency metrics",
            "error tracking",
            "upstream dependency timing",
        ],
        "common_pitfalls": [
            "business logic inside middleware",
            "no validation boundary",
            "routes growing without module discipline",
        ],
        "complexity_notes": [
            "Best as a thin integration or glue layer.",
            "The framework is not the guardrail; the team is.",
        ],
        "readiness_profile": {
            "level": "practical",
            "label": "Lean service ready",
            "summary": "Express is ready when the team wants a lightweight API surface and is willing to own all structure explicitly.",
            "signals": [
                "The service is small or integration-heavy.",
                "Framework opinion would add unnecessary weight.",
                "The team can enforce conventions outside the framework.",
            ],
            "risks": [
                "Route and middleware sprawl can accumulate quickly.",
                "The service can become fragile without validation and observability.",
            ],
            "next_steps": [
                "Define route and service boundaries early.",
                "Add validation, docs and auth middleware from the start.",
                "Keep the API intentionally small.",
            ],
            "score": 72,
        },
    },
    "react": {
        "specialist_label": "Frontend application surface",
        "summary": "React is the specialist for frontend apps, dashboards and SPAs when the team needs flexible component composition and disciplined routing.",
        "best_for": [
            "frontend apps",
            "dashboards",
            "single-page applications",
        ],
        "avoid_when": [
            "the task is backend or API generation alone",
            "the team cannot own routing discipline",
            "the product needs a batteries-included full-stack framework",
        ],
        "recommended_architectures": [
            {
                "architecture_id": "frontend_shell",
                "architecture_name": "Frontend shell",
                "summary": "The default for dashboard-style applications with shared layout structure.",
                "rationale": "React is strongest when the UI is split into clear feature and shell boundaries.",
                "tradeoff": "State management and routing discipline must be maintained by the team.",
            },
            {
                "architecture_id": "modular_frontend",
                "architecture_name": "Modular frontend",
                "summary": "Useful for larger UI surfaces that need explicit feature ownership.",
                "rationale": "Feature modules keep component ownership and data flow understandable.",
                "tradeoff": "Module planning is a team responsibility.",
            },
            {
                "architecture_id": "client_rendered",
                "architecture_name": "Client rendered",
                "summary": "Best when the app is highly interactive and browser-first.",
                "rationale": "React's composability makes client-rendered experiences straightforward.",
                "tradeoff": "SEO and initial payload need separate attention.",
            },
        ],
        "supported_archetypes": [
            "landing_page",
            "institutional_site",
            "portfolio",
            "blog",
            "sales_page",
            "catalog_site",
            "saas_dashboard",
            "admin_panel",
            "crm",
            "ecommerce",
        ],
        "recommended_capabilities": [
            {
                "capability_id": "seo",
                "summary": "Use SEO primitives when the app is publicly discoverable.",
                "rationale": "React alone does not solve search visibility, so the team must be intentional.",
                "priority": "recommended",
            },
            {
                "capability_id": "authentication",
                "summary": "Protect application state and session-aware UI.",
                "rationale": "Most React product surfaces need session gating.",
                "priority": "core",
            },
            {
                "capability_id": "analytics",
                "summary": "Instrument dashboards and product usage.",
                "rationale": "React often sits at the center of user behavior telemetry.",
                "priority": "recommended",
            },
            {
                "capability_id": "i18n",
                "summary": "Add locale-aware UI text and routing when the product expands globally.",
                "rationale": "React apps often serve multiple customer regions.",
                "priority": "optional",
            },
        ],
        "recommended_business_modules": ["users", "products", "reports", "settings"],
        "recommended_endpoint_groups": [
            {
                "endpoint_group": "auth",
                "title": "Session-aware UI data",
                "summary": "React surfaces often depend on auth and user state.",
                "recommended_endpoints": ["auth.me", "users.detail"],
            },
            {
                "endpoint_group": "analytics",
                "title": "Dashboard data",
                "summary": "Charts and summaries are the most common React delivery pattern.",
                "recommended_endpoints": ["analytics.overview", "analytics.activity"],
            },
        ],
        "tradeoffs": [
            {
                "title": "State sprawl",
                "summary": "Without routing and state discipline, React applications can become hard to reason about.",
                "impact": "high",
            },
            {
                "title": "Backend temptation",
                "summary": "React does not provide backend structure, so API work must live elsewhere.",
                "impact": "high",
            },
            {
                "title": "SEO depends on surrounding architecture",
                "summary": "Search visibility needs a framework or rendering strategy beyond core React.",
                "impact": "medium",
            },
        ],
        "testing_strategy": [
            "unit test components and hooks",
            "cover routing and navigation paths",
            "test accessibility and keyboard support",
            "verify integration with backend contracts",
        ],
        "security_baseline": [
            "session-safe auth integration",
            "route guarding",
            "secure client state handling",
            "server-side validation for sensitive operations",
        ],
        "deployment_baseline": [
            "static asset or SPA deployment",
            "clear environment configuration for API access",
            "CDN-friendly distribution when possible",
            "keep browser runtime assumptions explicit",
        ],
        "observability_baseline": [
            "client error tracking",
            "performance and route timing",
            "analytics events for user flows",
            "backend dependency visibility",
        ],
        "common_pitfalls": [
            "state sprawl",
            "no routing discipline",
            "trying to use React as a backend generator",
        ],
        "complexity_notes": [
            "Excellent for frontend-first delivery, but not a backend runtime.",
            "The main risk is organizational, not technical: too many owners touching the same UI state.",
        ],
        "readiness_profile": {
            "level": "practical",
            "label": "Frontend ready",
            "summary": "React is ready when the team needs a flexible frontend surface and understands that state and routing discipline must be owned deliberately.",
            "signals": [
                "The product is UI-heavy.",
                "The team needs component-level flexibility.",
                "Backend APIs already exist or will exist separately.",
            ],
            "risks": [
                "State sprawl and routing ambiguity can degrade the app quickly.",
                "React alone does not define a backend architecture.",
            ],
            "next_steps": [
                "Define routing and layout boundaries early.",
                "Keep data fetching and component state separate.",
                "Use a dedicated backend framework for API work.",
            ],
            "score": 83,
        },
    },
    "angular": {
        "specialist_label": "Structured enterprise frontend",
        "summary": "Angular is the specialist for enterprise frontends that want a consistent structure, strong conventions and a disciplined reactive model.",
        "best_for": [
            "enterprise frontend delivery",
            "structured SPAs",
            "internal tool interfaces",
        ],
        "avoid_when": [
            "the team wants maximum flexibility with minimal framework ceremony",
            "the UI is a tiny widget or micro surface",
            "the organization does not want a convention-heavy frontend",
        ],
        "recommended_architectures": [
            {
                "architecture_id": "frontend_shell",
                "architecture_name": "Frontend shell",
                "summary": "A strong default for large enterprise applications.",
                "rationale": "Angular's opinionated structure helps teams stay aligned on layout and navigation.",
                "tradeoff": "The framework expects commitment to its conventions.",
            },
            {
                "architecture_id": "modular_frontend",
                "architecture_name": "Modular frontend",
                "summary": "Best when the app is large enough to benefit from feature modules.",
                "rationale": "Angular modules can express ownership and lazy-loading boundaries clearly.",
                "tradeoff": "Modules can become overly complex if they are not bounded deliberately.",
            },
            {
                "architecture_id": "client_rendered",
                "architecture_name": "Client rendered",
                "summary": "Works well for dense internal tools and forms-heavy interfaces.",
                "rationale": "Angular's UI model is effective when the browser is the primary execution surface.",
                "tradeoff": "SEO and server rendering are not the default value proposition.",
            },
        ],
        "supported_archetypes": [
            "saas_dashboard",
            "admin_panel",
            "crm",
            "catalog_site",
            "ecommerce",
            "landing_page",
            "institutional_site",
            "blog",
        ],
        "recommended_capabilities": [
            {
                "capability_id": "authentication",
                "summary": "Use route guards and session-aware state.",
                "rationale": "Angular enterprise apps typically need protected flows.",
                "priority": "core",
            },
            {
                "capability_id": "analytics",
                "summary": "Instrument dashboards and internal workflows.",
                "rationale": "Structured SPAs often report business operations.",
                "priority": "recommended",
            },
            {
                "capability_id": "i18n",
                "summary": "Support locale and translation workflows.",
                "rationale": "Enterprise frontend surfaces often serve multiple regions.",
                "priority": "recommended",
            },
            {
                "capability_id": "pwa",
                "summary": "Enable offline-friendly app behavior when the use case benefits.",
                "rationale": "Internal tools and field applications can benefit from PWA delivery.",
                "priority": "optional",
            },
        ],
        "recommended_business_modules": ["users", "products", "reports", "settings"],
        "recommended_endpoint_groups": [
            {
                "endpoint_group": "admin",
                "title": "Administrative control surfaces",
                "summary": "Angular works well when admin state is explicit and structured.",
                "recommended_endpoints": ["admin.settings", "admin.audit_logs"],
            },
            {
                "endpoint_group": "analytics",
                "title": "Dashboard and reporting data",
                "summary": "Reporting-heavy interfaces benefit from direct API support.",
                "recommended_endpoints": ["analytics.overview", "analytics.revenue", "analytics.activity"],
            },
        ],
        "tradeoffs": [
            {
                "title": "Conventions over flexibility",
                "summary": "Angular is opinionated, which is a strength for governance and a constraint for small teams.",
                "impact": "medium",
            },
            {
                "title": "RxJS discipline required",
                "summary": "Reactive streams are powerful but punish poor ownership and inconsistent patterns.",
                "impact": "high",
            },
            {
                "title": "Module complexity",
                "summary": "Large Angular systems can become over-modularized if feature boundaries are not actively managed.",
                "impact": "medium",
            },
        ],
        "testing_strategy": [
            "unit test components and services",
            "cover reactive flows with integration tests",
            "use browser tests for key user journeys",
            "verify form validation and guard behavior",
        ],
        "security_baseline": [
            "route guards",
            "session-safe state handling",
            "input validation",
            "secure API access patterns",
        ],
        "deployment_baseline": [
            "static or CDN-backed frontend delivery",
            "clear environment configuration for API endpoints",
            "separate build outputs by environment",
            "keep bundle size under review",
        ],
        "observability_baseline": [
            "client error monitoring",
            "route and navigation timing",
            "interaction analytics",
            "backend dependency logging",
        ],
        "common_pitfalls": [
            "overcomplex modules",
            "poor RxJS discipline",
            "treating the framework as a shortcut around architecture",
        ],
        "complexity_notes": [
            "Excellent for teams that want a well-defined frontend architecture.",
            "It rewards process discipline more than improvisation.",
        ],
        "readiness_profile": {
            "level": "practical",
            "label": "Enterprise frontend ready",
            "summary": "Angular is ready when the team wants a highly structured frontend with strong conventions and explicit ownership of state flow.",
            "signals": [
                "The UI is large and enterprise-oriented.",
                "Consistency matters more than flexibility.",
                "The team can sustain reactive programming discipline.",
            ],
            "risks": [
                "Poor RxJS discipline will create maintenance debt.",
                "Feature modules can become bloated without governance.",
            ],
            "next_steps": [
                "Keep modules narrow and purposeful.",
                "Define shared state and route ownership early.",
                "Use the framework's structure as a governance asset.",
            ],
            "score": 86,
        },
    },
    "fastapi": {
        "specialist_label": "Typed async API backbone",
        "summary": "FastAPI is the specialist for APIs, async services and AI-adjacent backends that need typed contracts, clear docs and fast iteration.",
        "best_for": [
            "APIs",
            "async backends",
            "AI and RAG services",
        ],
        "avoid_when": [
            "the service must stay fully synchronous and trivial",
            "the team does not want to manage async boundaries",
            "the project is better served by a full product framework",
        ],
        "recommended_architectures": [
            {
                "architecture_id": "clean_architecture",
                "architecture_name": "Clean architecture",
                "summary": "A strong default for explicit service and domain boundaries.",
                "rationale": "FastAPI pairs well with an application service layer and dependency injection.",
                "tradeoff": "Needs structure to prevent route handlers from becoming business logic dumps.",
            },
            {
                "architecture_id": "modular_monolith",
                "architecture_name": "Modular monolith",
                "summary": "Great when the backend needs room to grow without becoming distributed too soon.",
                "rationale": "FastAPI's routers and dependencies are a natural fit for modular organization.",
                "tradeoff": "Module discipline is still a team responsibility.",
            },
            {
                "architecture_id": "microservice_api",
                "architecture_name": "Microservice API",
                "summary": "Useful when the service is already part of a larger distributed system.",
                "rationale": "FastAPI works well as a thin, highly focused service boundary.",
                "tradeoff": "Distributed systems require stronger testing and observability.",
            },
        ],
        "supported_archetypes": [
            "rest_api",
            "async_api",
            "microservice_api",
            "integration_api",
            "realtime_api",
            "banking_api",
            "healthcare_api",
            "ai_saas",
            "rag_system",
            "chatbot_platform",
            "automation_agent",
        ],
        "recommended_capabilities": [
            {
                "capability_id": "api_docs",
                "summary": "Use automatic docs as a live contract surface.",
                "rationale": "FastAPI is strongest when consumers can inspect the API immediately.",
                "priority": "core",
            },
            {
                "capability_id": "observability",
                "summary": "Instrument async paths, latency and failure modes.",
                "rationale": "Async services become hard to diagnose without visibility.",
                "priority": "core",
            },
            {
                "capability_id": "queue",
                "summary": "Move long-running work out of request paths.",
                "rationale": "FastAPI should stay responsive even when the domain is workflow-heavy.",
                "priority": "recommended",
            },
            {
                "capability_id": "ai_chat",
                "summary": "Use structured AI interactions when the service is AI-adjacent.",
                "rationale": "FastAPI is a strong backbone for AI service orchestration.",
                "priority": "recommended",
            },
            {
                "capability_id": "rag",
                "summary": "Enable retrieval-backed generation flows only when the product needs them.",
                "rationale": "FastAPI is often the service layer for RAG pipelines.",
                "priority": "optional",
            },
            {
                "capability_id": "authentication",
                "summary": "Protect public endpoints and sensitive operations.",
                "rationale": "Typed APIs still need session and token boundaries.",
                "priority": "core",
            },
        ],
        "recommended_business_modules": ["users", "orders", "payments", "reports", "notifications"],
        "recommended_endpoint_groups": [
            {
                "endpoint_group": "auth",
                "title": "Authentication and identity",
                "summary": "The service should own auth flows or act as a secure API boundary.",
                "recommended_endpoints": ["auth.login", "auth.me", "auth.refresh"],
            },
            {
                "endpoint_group": "ai",
                "title": "AI and retrieval",
                "summary": "AI services should be explicit about chat and embedding responsibilities.",
                "recommended_endpoints": ["ai.chat", "ai.embeddings"],
            },
            {
                "endpoint_group": "analytics",
                "title": "Operational metrics",
                "summary": "Async systems should expose their own operational surface.",
                "recommended_endpoints": ["analytics.overview", "analytics.activity"],
            },
        ],
        "tradeoffs": [
            {
                "title": "Async blocking risk",
                "summary": "Blocking work inside async routes undermines the framework's biggest advantage.",
                "impact": "high",
            },
            {
                "title": "Service layer needed",
                "summary": "FastAPI is not a business architecture by itself; it needs a real service boundary.",
                "impact": "medium",
            },
            {
                "title": "Lightweight by default",
                "summary": "The framework is easy to start with, but larger products still need deliberate structure.",
                "impact": "medium",
            },
        ],
        "testing_strategy": [
            "unit test service layer and dependencies",
            "use async integration tests for routes and background jobs",
            "cover contract tests for request and response models",
            "verify health and readiness behavior",
        ],
        "security_baseline": [
            "dependency-based auth",
            "request validation",
            "token or session protection",
            "audit logs for sensitive flows",
        ],
        "deployment_baseline": [
            "containerize the service",
            "keep async workers separate when needed",
            "use environment-driven configuration",
            "expose clear health endpoints",
        ],
        "observability_baseline": [
            "structured logs",
            "request metrics",
            "async worker tracing",
            "health and readiness endpoints",
        ],
        "common_pitfalls": [
            "missing service layer",
            "blocking code in async routes",
            "underestimating background job complexity",
        ],
        "complexity_notes": [
            "Excellent for API-first products and AI service orchestration.",
            "The async model is an advantage only when it is respected end to end.",
        ],
        "readiness_profile": {
            "level": "enterprise",
            "label": "API and AI service ready",
            "summary": "FastAPI is ready when the team needs a typed service backbone for APIs, async jobs or AI workflows.",
            "signals": [
                "The product is API-first or service-oriented.",
                "Async boundaries and background work matter.",
                "The team values generated docs and typed contracts.",
            ],
            "risks": [
                "Blocking code can silently destroy async performance.",
                "The architecture can drift if the service layer is absent.",
            ],
            "next_steps": [
                "Keep route handlers thin.",
                "Separate sync work from async execution paths.",
                "Add observability before scaling traffic.",
            ],
            "score": 92,
        },
    },
    "django": {
        "specialist_label": "Batteries-included Python system",
        "summary": "Django is the specialist for product systems that need admin, auth and a complete monolithic foundation with strong conventions.",
        "best_for": [
            "CRUD SaaS",
            "admin-heavy applications",
            "product systems with built-in governance",
        ],
        "avoid_when": [
            "the product needs only a tiny API surface",
            "the team wants a very lightweight framework",
            "the project is primarily AI or async service work",
        ],
        "recommended_architectures": [
            {
                "architecture_id": "monolith",
                "architecture_name": "Monolith",
                "summary": "The natural default for Django product delivery.",
                "rationale": "Django's batteries-included model is strongest when the system stays cohesive.",
                "tradeoff": "Can become large if app boundaries are not defined.",
            },
            {
                "architecture_id": "modular_monolith",
                "architecture_name": "Modular monolith",
                "summary": "A healthier long-term choice for larger Django systems.",
                "rationale": "Django apps can map cleanly to business capabilities.",
                "tradeoff": "Requires deliberate app and service boundaries.",
            },
            {
                "architecture_id": "clean_architecture",
                "architecture_name": "Clean architecture",
                "summary": "Useful when the domain logic must stay separate from framework details.",
                "rationale": "Django can support explicit service and repository layers.",
                "tradeoff": "Adds more structure than many Django teams start with.",
            },
        ],
        "supported_archetypes": ["saas_dashboard", "admin_panel", "crm", "rest_api", "ecommerce"],
        "recommended_capabilities": [
            {
                "capability_id": "authentication",
                "summary": "Django auth is a first-class baseline.",
                "rationale": "Most Django systems need identity from the start.",
                "priority": "core",
            },
            {
                "capability_id": "rbac",
                "summary": "Protect staff and business operations with roles.",
                "rationale": "Admin-heavy systems need access governance.",
                "priority": "core",
            },
            {
                "capability_id": "analytics",
                "summary": "Track operational and business metrics.",
                "rationale": "Product systems benefit from visibility into admin activity.",
                "priority": "recommended",
            },
            {
                "capability_id": "search",
                "summary": "Support discovery across product and admin data.",
                "rationale": "CRUD-heavy systems often need internal search.",
                "priority": "optional",
            },
        ],
        "recommended_business_modules": ["users", "products", "orders", "reports", "settings"],
        "recommended_endpoint_groups": [
            {
                "endpoint_group": "admin",
                "title": "Admin operations",
                "summary": "Django excels at business administration and operational tooling.",
                "recommended_endpoints": ["admin.settings", "admin.audit_logs"],
            },
            {
                "endpoint_group": "users",
                "title": "User and account management",
                "summary": "Identity, staff and customer flows fit naturally here.",
                "recommended_endpoints": ["users.list", "users.detail", "auth.login", "auth.me"],
            },
        ],
        "tradeoffs": [
            {
                "title": "Framework breadth",
                "summary": "Django gives a lot out of the box, which is great for product teams and heavy for tiny services.",
                "impact": "medium",
            },
            {
                "title": "Monolith gravity",
                "summary": "The framework naturally pulls teams toward a large cohesive application.",
                "impact": "medium",
            },
            {
                "title": "Async not central",
                "summary": "Django can serve APIs well, but it is not the same async-first posture as FastAPI.",
                "impact": "medium",
            },
        ],
        "testing_strategy": [
            "unit test app services and forms",
            "use integration tests for auth and admin flows",
            "cover ORM and migration behavior",
            "keep browser tests for critical screens",
        ],
        "security_baseline": [
            "built-in auth",
            "staff and role separation",
            "admin access hardening",
            "request validation",
        ],
        "deployment_baseline": [
            "monolithic deployment is acceptable and common",
            "separate settings by environment",
            "keep static assets and media handling explicit",
            "add database migration discipline",
        ],
        "observability_baseline": [
            "application logs",
            "admin activity traceability",
            "request metrics",
            "health checks",
        ],
        "common_pitfalls": [
            "treating Django as a tiny API helper only",
            "letting app modules sprawl",
            "under-investing in service boundaries as the codebase grows",
        ],
        "complexity_notes": [
            "Best for product systems that want batteries-included conventions.",
            "The framework favors a substantial app with strong operational and admin needs.",
        ],
        "readiness_profile": {
            "level": "practical",
            "label": "Product system ready",
            "summary": "Django is ready when the team needs a stable, conventional monolith with built-in auth and admin workflows.",
            "signals": [
                "The product has significant CRUD and admin needs.",
                "Speed of delivery matters more than minimalism.",
                "The team prefers framework conventions to assemble quickly.",
            ],
            "risks": [
                "The application can become a very large monolith without app discipline.",
                "Async and service decomposition need to be intentional.",
            ],
            "next_steps": [
                "Keep app boundaries explicit.",
                "Use service layers where business logic grows.",
                "Plan observability and migrations as part of the baseline.",
            ],
            "score": 84,
        },
    },
    "aspnet_core": {
        "specialist_label": ".NET enterprise service layer",
        "summary": "ASP.NET Core is the specialist for governed enterprise APIs and services that need strong runtime performance and mature tooling.",
        "best_for": [
            "enterprise APIs",
            "internal platforms",
            "distributed business systems",
        ],
        "avoid_when": [
            "the team does not want to invest in .NET conventions",
            "the product is tiny and disposable",
            "the delivery is primarily frontend-only",
        ],
        "recommended_architectures": [
            {
                "architecture_id": "clean_architecture",
                "architecture_name": "Clean architecture",
                "summary": "A strong default for enterprise-grade .NET services.",
                "rationale": "ASP.NET Core maps well to application services and domain boundaries.",
                "tradeoff": "Adds layers and requires disciplined dependency flow.",
            },
            {
                "architecture_id": "modular_monolith",
                "architecture_name": "Modular monolith",
                "summary": "Useful when the platform should remain simple and cohesive.",
                "rationale": "The .NET ecosystem supports strong modular boundaries within one deployment.",
                "tradeoff": "Requires deliberate separation to avoid large coupled assemblies.",
            },
            {
                "architecture_id": "microservices",
                "architecture_name": "Microservices",
                "summary": "Appropriate when the organization already operates services at scale.",
                "rationale": "ASP.NET Core performs well as a service boundary in cloud environments.",
                "tradeoff": "Distributed delivery adds operational cost.",
            },
        ],
        "supported_archetypes": ["rest_api", "integration_api", "microservice_api", "crm", "erp"],
        "recommended_capabilities": [
            {
                "capability_id": "authentication",
                "summary": "Use the built-in identity and auth stack where appropriate.",
                "rationale": "Enterprise .NET systems usually need governed identity from the start.",
                "priority": "core",
            },
            {
                "capability_id": "rbac",
                "summary": "Protect privileged workflows with clear roles.",
                "rationale": "ASP.NET Core is a strong fit for governed access control.",
                "priority": "core",
            },
            {
                "capability_id": "api_docs",
                "summary": "Publish clear API contracts through generated documentation.",
                "rationale": "Enterprise integration depends on excellent contract visibility.",
                "priority": "recommended",
            },
            {
                "capability_id": "observability",
                "summary": "Track logs, metrics and traces across the service boundary.",
                "rationale": "Operational maturity is a core expectation for .NET backends.",
                "priority": "core",
            },
            {
                "capability_id": "docker",
                "summary": "Containerize the service for repeatable deployment.",
                "rationale": "ASP.NET Core services are commonly delivered in containerized environments.",
                "priority": "recommended",
            },
        ],
        "recommended_business_modules": ["users", "orders", "payments", "audit", "settings"],
        "recommended_endpoint_groups": [
            {
                "endpoint_group": "auth",
                "title": "Identity and access routes",
                "summary": "Authentication and authorization should be explicit and hardened.",
                "recommended_endpoints": ["auth.login", "auth.me", "auth.logout"],
            },
            {
                "endpoint_group": "admin",
                "title": "Administrative and audit endpoints",
                "summary": "Governed .NET systems often expose strong admin surfaces.",
                "recommended_endpoints": ["admin.settings", "admin.audit_logs"],
            },
        ],
        "tradeoffs": [
            {
                "title": "More ceremony than tiny stacks",
                "summary": "ASP.NET Core is not the quickest path for disposable prototypes.",
                "impact": "medium",
            },
            {
                "title": "Enterprise bias",
                "summary": "The framework shines in organizations that can use its structure and governance model.",
                "impact": "medium",
            },
            {
                "title": "Architecture discipline required",
                "summary": "The service remains healthy only when boundaries and infrastructure concerns stay explicit.",
                "impact": "high",
            },
        ],
        "testing_strategy": [
            "unit test services and policies",
            "use integration tests for auth and persistence",
            "cover API contract tests",
            "validate deployment and health probes",
        ],
        "security_baseline": [
            "identity and authorization",
            "role-based access control",
            "request validation",
            "audit logging",
        ],
        "deployment_baseline": [
            "containerized release path",
            "externalized configuration",
            "rolling or blue-green deployment strategy",
            "separate worker and API responsibilities when needed",
        ],
        "observability_baseline": [
            "structured logs",
            "service metrics",
            "distributed tracing",
            "readiness and liveness probes",
        ],
        "common_pitfalls": [
            "overusing abstractions too early",
            "treating enterprise structure as optional",
            "ignoring deployment topology and observability",
        ],
        "complexity_notes": [
            "Well suited to teams that value strong tooling and clear governance.",
            "The ecosystem is strongest when architecture remains explicit.",
        ],
        "readiness_profile": {
            "level": "enterprise",
            "label": "Enterprise backend ready",
            "summary": "ASP.NET Core is ready when the team wants governed APIs and long-lived services with strong enterprise support.",
            "signals": [
                "The product needs strong service governance.",
                "The organization is comfortable with .NET tooling.",
                "Deployment and observability are part of the operating model.",
            ],
            "risks": [
                "Prototypes can become more ceremonious than necessary.",
                "The architecture can drift if boundaries are not maintained.",
            ],
            "next_steps": [
                "Adopt clean architecture or a modular monolith baseline.",
                "Define auth and audit expectations early.",
                "Keep observability and deployment patterns explicit.",
            ],
            "score": 90,
        },
    },
    "laravel": {
        "specialist_label": "Productive PHP delivery",
        "summary": "Laravel is the specialist for CRUD SaaS, admin systems and marketplaces that need fast delivery with a strong product-development workflow.",
        "best_for": [
            "CRUD SaaS",
            "admin systems",
            "marketplaces and commerce products",
        ],
        "avoid_when": [
            "the service must be extremely lean and minimal",
            "the team expects deep distributed systems tooling by default",
            "the project is primarily frontend-only",
        ],
        "recommended_architectures": [
            {
                "architecture_id": "monolith",
                "architecture_name": "Monolith",
                "summary": "The best default for most Laravel product systems.",
                "rationale": "Laravel is most productive when the app stays cohesive and feature-rich.",
                "tradeoff": "Large monoliths need strong module conventions.",
            },
            {
                "architecture_id": "modular_monolith",
                "architecture_name": "Modular monolith",
                "summary": "Helpful when the codebase grows beyond a small product team.",
                "rationale": "Clear module boundaries keep business features manageable.",
                "tradeoff": "Requires ongoing discipline to avoid folder sprawl.",
            },
            {
                "architecture_id": "clean_architecture",
                "architecture_name": "Clean architecture",
                "summary": "Useful for long-lived SaaS systems with complicated business logic.",
                "rationale": "A service layer keeps Laravel framework concerns separate from the domain.",
                "tradeoff": "Adds more structure than many Laravel teams start with.",
            },
        ],
        "supported_archetypes": ["ecommerce", "crm", "admin_panel", "rest_api"],
        "recommended_capabilities": [
            {
                "capability_id": "authentication",
                "summary": "Use Laravel auth as the baseline identity layer.",
                "rationale": "SaaS and admin workflows need session and token protection.",
                "priority": "core",
            },
            {
                "capability_id": "payments",
                "summary": "Support payment workflows and webhooks.",
                "rationale": "Commerce systems are a natural Laravel fit.",
                "priority": "recommended",
            },
            {
                "capability_id": "queue",
                "summary": "Use jobs and queues for background work.",
                "rationale": "Laravel shines when asynchronous business tasks are explicit.",
                "priority": "recommended",
            },
            {
                "capability_id": "email_notifications",
                "summary": "Trigger transactional communication from the product flow.",
                "rationale": "Laravel handles product communication well.",
                "priority": "recommended",
            },
            {
                "capability_id": "analytics",
                "summary": "Track business metrics and operational behavior.",
                "rationale": "CRUD and marketplace systems benefit from visibility into user flow.",
                "priority": "optional",
            },
        ],
        "recommended_business_modules": ["users", "products", "orders", "payments", "notifications", "reports"],
        "recommended_endpoint_groups": [
            {
                "endpoint_group": "auth",
                "title": "Identity and access",
                "summary": "Authentication and session handling are Laravel staples.",
                "recommended_endpoints": ["auth.login", "auth.register", "auth.me", "auth.logout"],
            },
            {
                "endpoint_group": "payments",
                "title": "Payments and commerce",
                "summary": "Laravel works well for transactional and marketplace flows.",
                "recommended_endpoints": ["payments.create", "payments.webhook", "payments.list"],
            },
            {
                "endpoint_group": "admin",
                "title": "Administrative operations",
                "summary": "Admin screens and audit paths are typical Laravel delivery points.",
                "recommended_endpoints": ["admin.settings", "admin.audit_logs"],
            },
        ],
        "tradeoffs": [
            {
                "title": "Monolith gravity",
                "summary": "Laravel is optimized for a cohesive product application, not very small code-only services.",
                "impact": "medium",
            },
            {
                "title": "Structure depends on the team",
                "summary": "The framework is productive, but module discipline must be enforced deliberately as the app grows.",
                "impact": "medium",
            },
            {
                "title": "Distributed systems are not the default story",
                "summary": "Queues and jobs are excellent, but deep distributed topology needs additional architecture work.",
                "impact": "medium",
            },
        ],
        "testing_strategy": [
            "unit test business services",
            "use integration tests for auth, queue and payment flows",
            "cover browser tests for admin workflows",
            "validate webhook contracts and retries",
        ],
        "security_baseline": [
            "auth and session protection",
            "csrf-aware request handling where applicable",
            "role-based access for admin flows",
            "audit logs for sensitive actions",
        ],
        "deployment_baseline": [
            "conventional web deployment path",
            "queue worker separation where needed",
            "environment-driven configuration",
            "explicit storage and cache settings",
        ],
        "observability_baseline": [
            "application logs",
            "queue worker visibility",
            "transaction and payment traceability",
            "health checks",
        ],
        "common_pitfalls": [
            "skipping queue discipline",
            "letting the monolith become unbounded",
            "forgetting payment and webhook observability",
        ],
        "complexity_notes": [
            "Very strong for product delivery where speed and structure both matter.",
            "The biggest risk is not the framework; it is losing module clarity in a growing codebase.",
        ],
        "readiness_profile": {
            "level": "practical",
            "label": "SaaS delivery ready",
            "summary": "Laravel is ready when the product needs a fast-moving monolith with auth, queues and commerce-friendly ergonomics.",
            "signals": [
                "The product is CRUD-heavy or commerce-oriented.",
                "The team wants quick feature throughput.",
                "Operational complexity is moderate rather than extreme.",
            ],
            "risks": [
                "The application can sprawl without module discipline.",
                "Queue and payment flows need careful observability.",
            ],
            "next_steps": [
                "Start with a monolith and narrow feature modules.",
                "Use queues and jobs early.",
                "Add payment and auth boundaries before scaling feature breadth.",
            ],
            "score": 85,
        },
    },
    "gin": {
        "specialist_label": "Go API backbone",
        "summary": "Gin is the specialist for compact, high-throughput Go APIs and service backends that favor performance and deployment simplicity.",
        "best_for": [
            "performant APIs",
            "service backends",
            "integration layers",
        ],
        "avoid_when": [
            "the team wants a batteries-included product framework",
            "the work is frontend-heavy",
            "the codebase requires lots of framework-provided opinion",
        ],
        "recommended_architectures": [
            {
                "architecture_id": "monolith",
                "architecture_name": "Monolith",
                "summary": "The simplest form for a compact Go API service.",
                "rationale": "Gin is strongest when the app stays lean and focused.",
                "tradeoff": "The team must own most conventions itself.",
            },
            {
                "architecture_id": "modular_monolith",
                "architecture_name": "Modular monolith",
                "summary": "A solid choice when the service needs explicit business separation.",
                "rationale": "A modular package structure keeps the service understandable as it grows.",
                "tradeoff": "Requires deliberate package discipline.",
            },
            {
                "architecture_id": "microservices",
                "architecture_name": "Microservices",
                "summary": "Gin works well as a focused service boundary in a distributed system.",
                "rationale": "Its minimalism fits service ownership and performance-sensitive APIs.",
                "tradeoff": "Distributed complexity must be handled outside the framework.",
            },
        ],
        "supported_archetypes": ["rest_api", "integration_api", "microservice_api"],
        "recommended_capabilities": [
            {
                "capability_id": "authentication",
                "summary": "Protect the public routes with a clean auth boundary.",
                "rationale": "Compact Go services still need access control.",
                "priority": "core",
            },
            {
                "capability_id": "observability",
                "summary": "Track service health, latency and error paths.",
                "rationale": "Gin is often used in high-throughput systems that need visibility.",
                "priority": "recommended",
            },
            {
                "capability_id": "rate_limiting",
                "summary": "Add throttling for public traffic.",
                "rationale": "Minimal services need a clear load control path.",
                "priority": "recommended",
            },
            {
                "capability_id": "docker",
                "summary": "Package the service as a reproducible container.",
                "rationale": "Go services are commonly deployed this way.",
                "priority": "recommended",
            },
        ],
        "recommended_business_modules": ["users", "orders", "reports"],
        "recommended_endpoint_groups": [
            {
                "endpoint_group": "integration",
                "title": "Integration APIs",
                "summary": "Gin works best as a focused integration or service endpoint layer.",
                "recommended_endpoints": ["users.list", "products.list", "orders.list"],
            },
        ],
        "tradeoffs": [
            {
                "title": "Minimal framework surface",
                "summary": "Gin gives speed but not much architectural guidance.",
                "impact": "medium",
            },
            {
                "title": "Team-owned structure",
                "summary": "The service will only stay healthy if the team designs and preserves the package boundaries.",
                "impact": "high",
            },
            {
                "title": "Product UI is not the target",
                "summary": "Gin is a backend specialist, not a product-front-end solution.",
                "impact": "low",
            },
        ],
        "testing_strategy": [
            "unit test service packages",
            "integration test route handlers and middleware",
            "verify error paths and upstream integration behavior",
            "include smoke tests for startup and health",
        ],
        "security_baseline": [
            "auth middleware",
            "request validation",
            "rate limiting",
            "secure header handling",
        ],
        "deployment_baseline": [
            "small container image",
            "stateless runtime assumptions",
            "explicit environment configuration",
            "health endpoint exposed to orchestration",
        ],
        "observability_baseline": [
            "structured logs",
            "latency metrics",
            "upstream dependency traces",
            "health and readiness checks",
        ],
        "common_pitfalls": [
            "missing conventions",
            "package sprawl",
            "building business logic into handlers",
        ],
        "complexity_notes": [
            "Great for low-overhead service backends.",
            "The framework intentionally leaves architecture choices to the team.",
        ],
        "readiness_profile": {
            "level": "practical",
            "label": "Lean service ready",
            "summary": "Gin is ready when the team wants a fast Go backend and is comfortable owning the architectural conventions around it.",
            "signals": [
                "The service must stay compact and fast.",
                "The team is Go-competent and architecture-minded.",
                "The product needs a narrow backend boundary.",
            ],
            "risks": [
                "The codebase can sprawl if package discipline is weak.",
                "The framework will not manage architecture for you.",
            ],
            "next_steps": [
                "Keep handlers thin and push logic into service packages.",
                "Add observability and rate limiting early.",
                "Stay strict about module ownership.",
            ],
            "score": 74,
        },
    },
    "fiber": {
        "specialist_label": "Go throughput specialist",
        "summary": "Fiber is the specialist for Go APIs that want high throughput, simple deployment and a small runtime surface.",
        "best_for": [
            "high-throughput APIs",
            "lightweight services",
            "microservice boundaries",
        ],
        "avoid_when": [
            "the team wants a heavily opinionated framework",
            "the app is frontend-first",
            "the service needs deep built-in product scaffolding",
        ],
        "recommended_architectures": [
            {
                "architecture_id": "monolith",
                "architecture_name": "Monolith",
                "summary": "A compact monolith is the natural start for Fiber.",
                "rationale": "Fiber's strength is lean service delivery.",
                "tradeoff": "Conventions and layering must be introduced by the team.",
            },
            {
                "architecture_id": "modular_monolith",
                "architecture_name": "Modular monolith",
                "summary": "Good when the service grows and needs more structure.",
                "rationale": "A modular package layout keeps the Go codebase navigable.",
                "tradeoff": "Architecture discipline remains entirely team-owned.",
            },
            {
                "architecture_id": "microservices",
                "architecture_name": "Microservices",
                "summary": "Excellent as a service edge in a distributed Go system.",
                "rationale": "Fiber is a strong fit for highly focused, low-latency APIs.",
                "tradeoff": "You need external observability and orchestration support.",
            },
        ],
        "supported_archetypes": ["rest_api", "integration_api", "microservice_api"],
        "recommended_capabilities": [
            {
                "capability_id": "authentication",
                "summary": "Add authentication around public routes.",
                "rationale": "Fiber stays minimal, so access control must be explicit.",
                "priority": "core",
            },
            {
                "capability_id": "observability",
                "summary": "Track latency and failure paths closely.",
                "rationale": "High-throughput services need operational visibility.",
                "priority": "recommended",
            },
            {
                "capability_id": "rate_limiting",
                "summary": "Throttle the public edge.",
                "rationale": "Lean APIs benefit from simple protection against noisy traffic.",
                "priority": "recommended",
            },
            {
                "capability_id": "docker",
                "summary": "Ship as a compact container.",
                "rationale": "Fiber is commonly deployed as a small service artifact.",
                "priority": "recommended",
            },
        ],
        "recommended_business_modules": ["users", "reports", "orders"],
        "recommended_endpoint_groups": [
            {
                "endpoint_group": "integration",
                "title": "Thin service endpoints",
                "summary": "Fiber works best as a narrow HTTP edge for services and integrations.",
                "recommended_endpoints": ["users.list", "products.list", "analytics.activity"],
            },
        ],
        "tradeoffs": [
            {
                "title": "Very little structure out of the box",
                "summary": "The framework is fast because it stays minimal, not because it manages architecture.",
                "impact": "medium",
            },
            {
                "title": "High-performance bias",
                "summary": "Fiber is great when throughput matters more than framework convenience.",
                "impact": "low",
            },
            {
                "title": "Service ownership still matters",
                "summary": "The team must define boundaries, validation and observability itself.",
                "impact": "high",
            },
        ],
        "testing_strategy": [
            "unit test core service logic",
            "integration test handlers and middleware",
            "cover upstream integration and failure paths",
            "keep startup and health checks in smoke coverage",
        ],
        "security_baseline": [
            "authentication middleware",
            "request validation",
            "rate limiting",
            "secure headers",
        ],
        "deployment_baseline": [
            "small container artifact",
            "stateless runtime",
            "environment-driven configuration",
            "health endpoint for orchestration",
        ],
        "observability_baseline": [
            "structured logs",
            "request metrics",
            "dependency tracing",
            "health and readiness probes",
        ],
        "common_pitfalls": [
            "handler sprawl",
            "missing middleware discipline",
            "underbuilding observability",
        ],
        "complexity_notes": [
            "A good choice when the team wants speed and deployment simplicity.",
            "The framework assumes architecture will be imposed by the service owner.",
        ],
        "readiness_profile": {
            "level": "practical",
            "label": "Lean service ready",
            "summary": "Fiber is ready when the team wants a small, performant Go API and is prepared to own the structure around it.",
            "signals": [
                "The service boundary is narrow.",
                "Throughput and deployment simplicity matter.",
                "The team can enforce its own conventions.",
            ],
            "risks": [
                "The service can become hard to maintain without boundary discipline.",
                "Operational visibility must be added explicitly.",
            ],
            "next_steps": [
                "Keep the API thin.",
                "Add auth, rate limiting and observability early.",
                "Use a modular package layout as the service grows.",
            ],
            "score": 73,
        },
    },
}


class FrameworkSpecialistService:
    def __init__(self, repository: RegistryRepository | None = None) -> None:
        self.repository = repository or RegistryRepository()

    def get_specialist_profile(self, framework_id: str) -> dict[str, Any]:
        framework = self._get_framework(framework_id)
        metadata = self._get_metadata(framework_id)
        return self._build_profile(framework, metadata)

    def get_recommended_architectures(self, framework_id: str) -> list[dict[str, Any]]:
        return list(self.get_specialist_profile(framework_id)["recommended_architectures"])

    def get_recommended_capabilities(self, framework_id: str) -> list[dict[str, Any]]:
        return list(self.get_specialist_profile(framework_id)["recommended_capabilities"])

    def get_recommended_endpoints(self, framework_id: str) -> list[dict[str, Any]]:
        return list(self.get_specialist_profile(framework_id)["recommended_endpoint_groups"])

    def get_readiness(self, framework_id: str) -> dict[str, Any]:
        return dict(self.get_specialist_profile(framework_id)["readiness_profile"])

    def _build_profile(self, framework: dict[str, Any], metadata: dict[str, Any]) -> dict[str, Any]:
        return {
            "contractVersion": CONTRACT_VERSION,
            "framework_id": framework["id"],
            "language_id": framework["language_id"],
            "runtime_id": framework["runtime_id"],
            "framework_name": framework["name"],
            "specialist_label": metadata["specialist_label"],
            "summary": metadata["summary"],
            "best_for": list(metadata["best_for"]),
            "avoid_when": list(metadata["avoid_when"]),
            "recommended_architectures": [
                {
                    "contractVersion": CONTRACT_VERSION,
                    "architecture_id": item["architecture_id"],
                    "architecture_name": item["architecture_name"],
                    "summary": item["summary"],
                    "rationale": item["rationale"],
                    "tradeoff": item["tradeoff"],
                }
                for item in metadata["recommended_architectures"]
            ],
            "supported_archetypes": [
                self._get_archetype_name(archetype_id) for archetype_id in metadata["supported_archetypes"]
            ],
            "recommended_capabilities": [
                {
                    "contractVersion": CONTRACT_VERSION,
                    "capability_id": item["capability_id"],
                    "capability_name": self._get_capability_name(item["capability_id"]),
                    "summary": item["summary"],
                    "rationale": item["rationale"],
                    "priority": item["priority"],
                }
                for item in metadata["recommended_capabilities"]
            ],
            "recommended_business_modules": [
                self._get_business_module_name(module_id) for module_id in metadata["recommended_business_modules"]
            ],
            "recommended_endpoint_groups": [
                {
                    "contractVersion": CONTRACT_VERSION,
                    "endpoint_group": item["endpoint_group"],
                    "title": item["title"],
                    "summary": item["summary"],
                    "recommended_endpoints": [
                        self._get_endpoint_path(endpoint_id) for endpoint_id in item["recommended_endpoints"]
                    ],
                }
                for item in metadata["recommended_endpoint_groups"]
            ],
            "tradeoffs": [
                {
                    "contractVersion": CONTRACT_VERSION,
                    "title": item["title"],
                    "summary": item["summary"],
                    "impact": item["impact"],
                }
                for item in metadata["tradeoffs"]
            ],
            "testing_strategy": list(metadata["testing_strategy"]),
            "security_baseline": list(metadata["security_baseline"]),
            "deployment_baseline": list(metadata["deployment_baseline"]),
            "infrastructure_baseline": list(_infrastructure_baseline(framework["id"])),
            "observability_baseline": list(metadata["observability_baseline"]),
            "common_pitfalls": list(metadata["common_pitfalls"]),
            "complexity_notes": list(metadata["complexity_notes"]),
            "readiness_profile": {
                "contractVersion": CONTRACT_VERSION,
                "level": metadata["readiness_profile"]["level"],
                "label": metadata["readiness_profile"]["label"],
                "summary": metadata["readiness_profile"]["summary"],
                "signals": list(metadata["readiness_profile"]["signals"]),
                "risks": list(metadata["readiness_profile"]["risks"]),
                "next_steps": list(metadata["readiness_profile"]["next_steps"]),
                "score": metadata["readiness_profile"]["score"],
            },
        }

    def _get_metadata(self, framework_id: str) -> dict[str, Any]:
        metadata = FRAMEWORK_SPECIALIST_DATA.get(framework_id)
        if metadata is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Framework '{framework_id}' was not found.",
            )
        return metadata

    def _get_framework(self, framework_id: str) -> dict[str, Any]:
        framework = next((item for item in self.repository.list_frameworks() if item["id"] == framework_id), None)
        if framework is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Framework '{framework_id}' was not found.",
            )
        return framework

    def _get_archetype_name(self, archetype_id: str) -> str:
        archetype = next((item for item in self.repository.list_archetypes() if item["id"] == archetype_id), None)
        if archetype is None:
            return archetype_id
        return archetype["name"]

    def _get_capability_name(self, capability_id: str) -> str:
        capability = next((item for item in self.repository.list_capabilities() if item["id"] == capability_id), None)
        if capability is None:
            return capability_id
        return capability["name"]

    def _get_business_module_name(self, module_id: str) -> str:
        module = next((item for item in self.repository.list_business_modules() if item["id"] == module_id), None)
        if module is None:
            return module_id
        return module["name"]

    def _get_endpoint_path(self, endpoint_id: str) -> str:
        endpoint = next((item for item in self.repository.list_endpoints() if item["id"] == endpoint_id), None)
        if endpoint is None:
            return endpoint_id
        return endpoint["path"]


def _infrastructure_baseline(framework_id: str) -> list[str]:
    if framework_id == "spring_boot":
        return [
            "postgresql",
            "redis",
            "kafka or rabbitmq",
            "docker_compose",
            "prometheus",
            "grafana",
            "opentelemetry",
        ]
    if framework_id == "nestjs":
        return [
            "postgresql",
            "redis",
            "docker_compose",
            "opentelemetry",
            "sentry",
        ]
    if framework_id == "nextjs":
        return [
            "vercel",
            "postgresql",
            "nextauth or clerk",
            "cloudflare_r2",
            "sentry",
        ]
    if framework_id == "fastapi":
        return [
            "postgresql",
            "redis",
            "pgvector or qdrant",
            "docker_compose",
            "opentelemetry",
            "sentry",
        ]
    if framework_id == "django":
        return ["postgresql", "redis", "docker_compose", "resend", "sentry"]
    if framework_id == "aspnet_core":
        return ["postgresql", "redis", "docker_compose", "keycloak or auth0", "opentelemetry"]
    if framework_id == "laravel":
        return ["mysql or postgresql", "redis", "docker_compose", "resend", "stripe"]
    if framework_id in {"gin", "fiber"}:
        return ["postgresql", "redis", "docker_compose", "nginx", "opentelemetry"]
    if framework_id == "react":
        return ["vercel", "sentry", "cloudflare_r2", "opentelemetry"]
    if framework_id == "angular":
        return ["vercel", "sentry", "opentelemetry"]
    return ["postgresql", "redis", "docker_compose", "opentelemetry"]
