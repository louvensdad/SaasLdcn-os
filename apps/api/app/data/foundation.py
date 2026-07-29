from __future__ import annotations

from typing import Any


CONTRACT_VERSION = "1.0.0"


LOCALES: list[dict[str, Any]] = [
    {
        "code": "pt-BR",
        "language": "Portugu\u00eas",
        "name": "Brazilian Portuguese",
        "nativeName": "Portugu\u00eas (Brasil)",
        "isDefault": True,
        "direction": "ltr",
    },
    {
        "code": "en-US",
        "language": "English",
        "name": "English (United States)",
        "nativeName": "English (United States)",
        "isDefault": False,
        "direction": "ltr",
    },
    {
        "code": "es-ES",
        "language": "Espa\u00f1ol",
        "name": "Spanish (Spain)",
        "nativeName": "Espa\u00f1ol (Espa\u00f1a)",
        "isDefault": False,
        "direction": "ltr",
    },
    {
        "code": "fr-FR",
        "language": "Fran\u00e7ais",
        "name": "French (France)",
        "nativeName": "Fran\u00e7ais (France)",
        "isDefault": False,
        "direction": "ltr",
    },
]


STACKS: list[dict[str, Any]] = [
    {
        "contractVersion": CONTRACT_VERSION,
        "id": "static_site",
        "name": "Static Site",
        "category": "marketing",
        "status": "active",
        "description": "Content-first static site foundation for marketing pages and lean launches.",
        "supported_locales": ["pt-BR", "en-US", "es-ES"],
        "supported_generation_modes": ["foundation", "template_assisted"],
        "allowed_architectures": ["static_export"],
        "required_fields": [
            "project_name",
            "site_type",
            "audience",
            "sections",
            "style_direction",
            "seo_goal",
            "contact_form",
            "locale",
        ],
        "optional_fields": [],
        "features": [
            {
                "key": "content_sections",
                "label": "Content Sections",
                "description": "Supports hero, features, CTA and landing-style section planning.",
            },
            {
                "key": "seo_foundation",
                "label": "SEO Foundation",
                "description": "Prepared for metadata planning and search-oriented structure.",
            },
        ],
        "constraints": [
            {
                "key": "no_backend_runtime",
                "level": "warning",
                "message": "Static Site is constrained to frontend-only delivery in this foundation phase.",
            },
            {
                "key": "no_agent_modules",
                "level": "error",
                "message": "AI, agent, voice and avatar capabilities remain blocked for this stack.",
            },
        ],
        "wizard_profile": {
            "profileId": "wizard_static_site_foundation",
            "entryStep": "stack_selection",
            "recommendedFlow": [
                "stack_selection",
                "site_strategy",
                "content_structure",
                "review",
            ],
            "validationMode": "standard",
        },
        "template_compatibility": {
            "compatibleTemplateIds": ["template_static_landing"],
            "defaultTemplateId": "template_static_landing",
            "supportsBlankStart": True,
        },
        "gatekeeper_profile": {
            "profileId": "gatekeeper_static_site",
            "releaseStage": "foundation",
            "blockedCapabilities": ["ai", "agents", "voice", "avatar", "generation"],
            "requiredChecks": ["field-completeness", "locale-supported"],
        },
    },
    {
        "contractVersion": CONTRACT_VERSION,
        "id": "react",
        "name": "React",
        "category": "frontend",
        "status": "active",
        "description": "Frontend SPA foundation for interactive product surfaces and component-driven experiences.",
        "supported_locales": ["pt-BR", "en-US", "es-ES"],
        "supported_generation_modes": ["foundation", "template_assisted", "guided"],
        "allowed_architectures": ["single_page_app", "modular_monolith"],
        "required_fields": [
            "project_name",
            "site_or_app_type",
            "design_direction",
            "locale",
        ],
        "optional_fields": ["seo_required", "auth_required"],
        "features": [
            {
                "key": "component_frontend",
                "label": "Component Frontend",
                "description": "Supports modular interface composition and product-led frontend planning.",
            },
        ],
        "constraints": [
            {
                "key": "backend_optional",
                "level": "info",
                "message": "React foundation can stay frontend-only or pair with a backend stack later.",
            },
        ],
        "wizard_profile": {
            "profileId": "wizard_react_spa",
            "entryStep": "stack_selection",
            "recommendedFlow": [
                "stack_selection",
                "experience_shape",
                "frontend_capabilities",
                "review",
            ],
            "validationMode": "standard",
        },
        "template_compatibility": {
            "compatibleTemplateIds": [],
            "supportsBlankStart": True,
        },
        "gatekeeper_profile": {
            "profileId": "gatekeeper_react",
            "releaseStage": "foundation",
            "blockedCapabilities": ["ai", "agents", "voice", "avatar", "generation"],
            "requiredChecks": ["field-completeness", "locale-supported"],
        },
    },
    {
        "contractVersion": CONTRACT_VERSION,
        "id": "angular",
        "name": "Angular",
        "category": "frontend",
        "status": "active",
        "description": "Structured frontend foundation for enterprise-grade web applications and admin experiences.",
        "supported_locales": ["pt-BR", "en-US"],
        "supported_generation_modes": ["foundation", "guided"],
        "allowed_architectures": ["single_page_app", "modular_monolith"],
        "required_fields": [
            "project_name",
            "site_or_app_type",
            "design_direction",
            "locale",
        ],
        "optional_fields": ["auth_required", "i18n"],
        "features": [
            {
                "key": "enterprise_frontend",
                "label": "Enterprise Frontend",
                "description": "Prepared for strongly structured modules, forms and admin-oriented flows.",
            },
        ],
        "constraints": [
            {
                "key": "backend_optional",
                "level": "info",
                "message": "Angular foundation can remain frontend-only or connect to a backend stack later.",
            },
        ],
        "wizard_profile": {
            "profileId": "wizard_angular_admin",
            "entryStep": "stack_selection",
            "recommendedFlow": [
                "stack_selection",
                "experience_shape",
                "frontend_capabilities",
                "review",
            ],
            "validationMode": "standard",
        },
        "template_compatibility": {
            "compatibleTemplateIds": [],
            "supportsBlankStart": True,
        },
        "gatekeeper_profile": {
            "profileId": "gatekeeper_angular",
            "releaseStage": "foundation",
            "blockedCapabilities": ["ai", "agents", "voice", "avatar", "generation"],
            "requiredChecks": ["field-completeness", "locale-supported"],
        },
    },
    {
        "contractVersion": CONTRACT_VERSION,
        "id": "fastapi",
        "name": "FastAPI",
        "category": "backend",
        "status": "active",
        "description": "Python API foundation for modular local-first services and SQLite-first persistence.",
        "supported_locales": ["pt-BR", "en-US", "es-ES", "fr-FR"],
        "supported_generation_modes": ["foundation", "template_assisted", "guided"],
        "allowed_architectures": ["modular_monolith", "clean_architecture", "domain_modular"],
        "required_fields": [
            "project_name",
            "business_domain",
            "api_modules",
            "database",
            "auth_strategy",
            "async_jobs",
            "docs_required",
            "locale",
        ],
        "optional_fields": [],
        "features": [
            {
                "key": "sqlite_local_first",
                "label": "SQLite Local First",
                "description": "Optimized for local-first persistence and modular service growth.",
            },
            {
                "key": "async_ready",
                "label": "Async Ready",
                "description": "Prepared for async endpoints and background job decisions without enabling generation.",
            },
        ],
        "constraints": [
            {
                "key": "no_generation_runtime",
                "level": "warning",
                "message": "FastAPI foundation excludes generation and orchestration capabilities in this phase.",
            },
            {
                "key": "contracts_preferred",
                "level": "info",
                "message": "Contract alignment is encouraged before expanding the API surface further.",
            },
        ],
        "wizard_profile": {
            "profileId": "wizard_fastapi_service",
            "entryStep": "stack_selection",
            "recommendedFlow": [
                "stack_selection",
                "service_scope",
                "persistence",
                "delivery_review",
            ],
            "validationMode": "strict",
        },
        "template_compatibility": {
            "compatibleTemplateIds": ["template_fastapi_service"],
            "defaultTemplateId": "template_fastapi_service",
            "supportsBlankStart": True,
        },
        "gatekeeper_profile": {
            "profileId": "gatekeeper_fastapi",
            "releaseStage": "foundation",
            "blockedCapabilities": ["ai", "agents", "voice", "avatar", "generation"],
            "requiredChecks": ["field-completeness", "locale-supported", "template-compatible"],
        },
    },
    {
        "contractVersion": CONTRACT_VERSION,
        "id": "spring_boot",
        "name": "Spring Boot",
        "category": "backend",
        "status": "active",
        "description": "Java backend foundation for enterprise-grade services with explicit architecture choices.",
        "supported_locales": ["pt-BR", "en-US"],
        "supported_generation_modes": ["foundation", "guided"],
        "allowed_architectures": ["layered_monolith", "clean_architecture", "domain_modular"],
        "required_fields": [
            "project_name",
            "business_domain",
            "architecture_style",
            "database",
            "auth_strategy",
            "messaging",
            "docker_required",
            "observability",
            "locale",
        ],
        "optional_fields": [],
        "features": [
            {
                "key": "enterprise_service_layers",
                "label": "Enterprise Service Layers",
                "description": "Supports layered and domain-driven backend organization.",
            },
            {
                "key": "operational_controls",
                "label": "Operational Controls",
                "description": "Prepared for observability and deployment guardrails.",
            },
        ],
        "constraints": [
            {
                "key": "java_runtime_required",
                "level": "warning",
                "message": "Spring Boot assumes a managed JVM runtime and stronger infrastructure discipline.",
            },
            {
                "key": "no_live_agents",
                "level": "error",
                "message": "Agent or voice-based workflows are blocked in this registry phase.",
            },
        ],
        "wizard_profile": {
            "profileId": "wizard_spring_boot_enterprise",
            "entryStep": "stack_selection",
            "recommendedFlow": [
                "stack_selection",
                "architecture_decisions",
                "delivery_controls",
                "review",
            ],
            "validationMode": "strict",
        },
        "template_compatibility": {
            "compatibleTemplateIds": [],
            "supportsBlankStart": True,
        },
        "gatekeeper_profile": {
            "profileId": "gatekeeper_spring_boot",
            "releaseStage": "validated",
            "blockedCapabilities": ["ai", "agents", "voice", "avatar", "generation"],
            "requiredChecks": ["field-completeness", "locale-supported", "architecture-allowed"],
        },
    },
    {
        "contractVersion": CONTRACT_VERSION,
        "id": "nestjs",
        "name": "NestJS",
        "category": "backend",
        "status": "active",
        "description": "TypeScript backend foundation for modular APIs and queue-aware service design.",
        "supported_locales": ["pt-BR", "en-US"],
        "supported_generation_modes": ["foundation", "guided"],
        "allowed_architectures": ["modular_monolith", "clean_architecture", "domain_modular"],
        "required_fields": [
            "project_name",
            "business_domain",
            "architecture_style",
            "database",
            "auth_strategy",
            "ai_agents_required",
            "queue_required",
            "locale",
        ],
        "optional_fields": [],
        "features": [
            {
                "key": "module_structure",
                "label": "Module Structure",
                "description": "Supports explicit domain modules and API boundaries.",
            },
            {
                "key": "queue_preparation",
                "label": "Queue Preparation",
                "description": "Prepared for queue decisions without enabling real orchestration or agents.",
            },
        ],
        "constraints": [
            {
                "key": "agent_flag_blocked",
                "level": "warning",
                "message": "Agent-related fields are planning signals only and do not enable agents in foundation mode.",
            },
            {
                "key": "no_runtime_ai",
                "level": "error",
                "message": "Runtime AI, voice and avatar integrations remain blocked.",
            },
        ],
        "wizard_profile": {
            "profileId": "wizard_nestjs_modular_api",
            "entryStep": "stack_selection",
            "recommendedFlow": [
                "stack_selection",
                "domain_design",
                "queue_decisions",
                "review",
            ],
            "validationMode": "strict",
        },
        "template_compatibility": {
            "compatibleTemplateIds": [],
            "supportsBlankStart": True,
        },
        "gatekeeper_profile": {
            "profileId": "gatekeeper_nestjs",
            "releaseStage": "foundation",
            "blockedCapabilities": ["ai", "agents", "voice", "avatar", "generation"],
            "requiredChecks": ["field-completeness", "locale-supported", "architecture-allowed"],
        },
    },
    {
        "contractVersion": CONTRACT_VERSION,
        "id": "nextjs",
        "name": "Next.js",
        "category": "full_stack",
        "status": "active",
        "description": "Full-stack web foundation for application and website experiences with app-router oriented structure.",
        "supported_locales": ["pt-BR", "en-US", "es-ES"],
        "supported_generation_modes": ["foundation", "template_assisted", "guided"],
        "allowed_architectures": ["app_router", "modular_monolith"],
        "required_fields": [
            "project_name",
            "site_or_app_type",
            "rendering_strategy",
            "auth_required",
            "seo_required",
            "cms_required",
            "design_direction",
            "locale",
        ],
        "optional_fields": [],
        "features": [
            {
                "key": "app_router_ready",
                "label": "App Router Ready",
                "description": "Optimized for app-router experiences and integrated UI surfaces.",
            },
            {
                "key": "content_and_app_modes",
                "label": "Content and App Modes",
                "description": "Supports both site-oriented and app-oriented planning flows.",
            },
        ],
        "constraints": [
            {
                "key": "no_generation_modules",
                "level": "warning",
                "message": "Generation and AI modules remain disabled for Next.js foundation work.",
            },
            {
                "key": "frontend_backend_scope_only",
                "level": "info",
                "message": "This stack is limited to frontend and backend foundation planning in the current registry.",
            },
        ],
        "wizard_profile": {
            "profileId": "wizard_nextjs_workspace",
            "entryStep": "stack_selection",
            "recommendedFlow": [
                "stack_selection",
                "experience_shape",
                "rendering_plan",
                "review",
            ],
            "validationMode": "standard",
        },
        "template_compatibility": {
            "compatibleTemplateIds": ["template_nextjs_workspace"],
            "defaultTemplateId": "template_nextjs_workspace",
            "supportsBlankStart": True,
        },
        "gatekeeper_profile": {
            "profileId": "gatekeeper_nextjs",
            "releaseStage": "foundation",
            "blockedCapabilities": ["ai", "agents", "voice", "avatar", "generation"],
            "requiredChecks": ["field-completeness", "locale-supported", "template-compatible"],
        },
    },
]


TEMPLATES: list[dict[str, Any]] = [
    {
        "contractVersion": CONTRACT_VERSION,
        "templateId": "template_static_landing",
        "templateCode": "static_landing",
        "name": "Static Landing Foundation",
        "description": "Baseline landing page template for static sites.",
        "stackId": "static_site",
        "archetypeIds": ["landing_page", "sales_page", "institutional_site"],
        "supportedLocales": ["pt-BR", "en-US"],
        "status": "ready",
        "visibility": "public",
        "blueprint": {
            "summary": "Simple static landing with content sections.",
            "modules": ["hero", "features", "cta"],
            "requiredFiles": ["index.html", "styles.css"],
            "forbiddenFiles": ["agent.py", "voice.ts"],
            "notes": ["No generation modules enabled."],
        },
        "preview": {
            "title": "Static Landing",
            "description": "Foundation for content-first launches.",
            "highlights": ["fast setup", "local assets only"],
        },
        "defaultAnswers": {
            "theme": "clean",
            "analytics": False,
        },
        "promptSeed": "foundation-static-landing",
        "tags": ["foundation", "landing", "static"],
    },
    {
        "contractVersion": CONTRACT_VERSION,
        "templateId": "template_fastapi_service",
        "templateCode": "fastapi_service",
        "name": "FastAPI Service Foundation",
        "description": "Modular API starter prepared for contracts.",
        "stackId": "fastapi",
        "archetypeIds": ["rest_api", "integration_api"],
        "supportedLocales": ["pt-BR", "en-US"],
        "status": "ready",
        "visibility": "public",
        "blueprint": {
            "summary": "FastAPI starter with routing, services and persistence.",
            "modules": ["routes", "services", "repositories"],
            "requiredFiles": ["main.py", "requirements.txt"],
            "forbiddenFiles": ["agent.py", "voice.ts"],
            "notes": ["Designed for local SQLite first."],
        },
        "preview": {
            "title": "FastAPI Service",
            "description": "Backend-first template with clean modules.",
            "highlights": ["sqlite local-first", "clear errors"],
        },
        "defaultAnswers": {
            "database": "sqlite",
            "contractsReady": True,
        },
        "promptSeed": "foundation-fastapi-service",
        "tags": ["foundation", "backend", "api"],
    },
    {
        "contractVersion": CONTRACT_VERSION,
        "templateId": "template_nextjs_workspace",
        "templateCode": "nextjs_workspace",
        "name": "Next.js Workspace Foundation",
        "description": "Workspace-oriented web template with room for API integration.",
        "stackId": "nextjs",
        "archetypeIds": ["saas_dashboard", "admin_panel", "documentation_site"],
        "supportedLocales": ["pt-BR", "en-US"],
        "status": "ready",
        "visibility": "public",
        "blueprint": {
            "summary": "App shell with room for modular product flows.",
            "modules": ["app-shell", "navigation", "settings"],
            "requiredFiles": ["app/page.tsx", "app/layout.tsx"],
            "forbiddenFiles": ["agent.py", "voice.ts"],
            "notes": ["Frontend remains disconnected from backend for now."],
        },
        "preview": {
            "title": "Workspace Foundation",
            "description": "Structured app shell for product evolution.",
            "highlights": ["modular ui", "contracts-friendly"],
        },
        "defaultAnswers": {
            "search": True,
            "notifications": True,
        },
        "promptSeed": "foundation-nextjs-workspace",
        "tags": ["foundation", "web", "workspace"],
    },
]


PROJECT_SEED: list[dict[str, Any]] = []
