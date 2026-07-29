from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.core.config import get_settings
from app.core.cors import configure_cors
from app.core.deps import get_current_user
from app.core.exceptions import UnhandledExceptionMiddleware, configure_exception_handlers
from app.core.logging import RequestIdMiddleware, RequestLoggingMiddleware, logger
from app.core.rate_limit import RateLimitMiddleware
from app.core.security_headers import SecurityHeadersMiddleware
from app.services.automation_scheduler import automation_scheduler
from app.services.platform_runtime_config_service import platform_runtime_config_service
from app.routes import (
    agent_foundation,
    activity_feed,
    ai_status,
    analytics,
    architectural_graph,
    auth,
    automations,
    billing,
    billing_catalog,
    backend_generation,
    blueprints,
    change_requests,
    contracts,
    deep_engineering,
    dependency_graph,
    documentation,
    downloads,
    engineering_lab,
    engineering_readiness,
    execution_profiles,
    generation_handoff,
    generation_notifications,
    generated_project_quality,
    git_export,
    git_providers,
    infrastructure,
    infra_cost,
    features,
    framework_specialists,
    gatekeeper,
    health,
    marketplace,
    language_domains,
    language_model,
    live_preview,
    local_generation,
    llm_settings,
    localization,
    meta_factory,
    missions,
    mission_deliverable_jobs,
    modernize,
    observability,
    permissions,
    project_rooms,
    sandbox_policy_exceptions,
    projects,
    prompt_master,
    registry,
    roadmap,
    stacks,
    skills,
    runtime,
    staging,
    student_eligibility,
    system_presence,
    system_status,
    system_design_visualization,
    templates,
    test_runner,
    tenants,
    user_ai_keys,
    user_preferences,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    projects.service.initialize()
    # Never log the database URL: production URLs commonly embed credentials.
    logger.info("Database ready")
    # Re-apply any admin-set worker-limit / job-lease / audit-retention override
    # BEFORE anything else can read them (agent pool is otherwise lazily sized
    # from the env-var default on first use).
    platform_runtime_config_service.hydrate_from_db()
    if get_settings().environment == "production":
        recovery = meta_factory.generation_job_engine.reconcile_startup()
        logger.info(
            "Generation job recovery complete: stalled=%s resumed=%s",
            recovery["stalled"], recovery["resumed"],
        )
        deliverable_recovery = mission_deliverable_jobs.engine.reconcile_startup()
        logger.info("Mission deliverable job recovery complete: stalled=%s", deliverable_recovery["stalled"])
    # Automation scheduler (DEC-004): a real in-process background poller for
    # "scheduled" automations. Skipped in "test" so the full suite (hundreds
    # of app start/stops via the `client` fixture) never accumulates threads
    # or risks a stray due automation firing mid-test.
    if get_settings().environment != "test":
        automation_scheduler.start()
    yield
    automation_scheduler.stop()


def create_application() -> FastAPI:
    settings = get_settings()
    # Disable the interactive API docs (Swagger UI / ReDoc / openapi.json) anywhere
    # that is not local dev: they are unauthenticated and would leak the full API
    # surface. Staging is often externally reachable, so it must NOT expose docs
    # either (audit S4/M9) — only local/dev keeps them for developer ergonomics.
    docs_enabled = settings.environment == "local"
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        debug=settings.debug,
        lifespan=lifespan,
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )
    # Innermost middleware (added first): catches any exception a route/dependency
    # doesn't handle, BEFORE it can escape past CORS/security/request-id headers.
    # See UnhandledExceptionMiddleware's docstring for why this can't be a plain
    # @app.exception_handler(Exception) -- that bypasses every middleware below.
    app.add_middleware(UnhandledExceptionMiddleware)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_hosts)
    configure_cors(app)
    configure_exception_handlers(app)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(RequestLoggingMiddleware)
    # Starlette applies add_middleware in reverse of call order, so adding this
    # last makes it the outermost layer: the request id is set before anything
    # else runs and is therefore already in the contextvar when
    # RequestLoggingMiddleware emits its own log line.
    app.add_middleware(RequestIdMiddleware)

    # Public routes: no authentication required. Health checks must always be
    # reachable, auth endpoints are how a session is obtained in the first
    # place, and localization is needed to render the login/registration
    # screens themselves (language picker, validation messages, etc.).
    app.include_router(health.router, prefix=settings.api_prefix)
    app.include_router(auth.router, prefix=settings.api_prefix)
    app.include_router(localization.router, prefix=settings.api_prefix)
    # Metrics are available in production behind a dedicated bearer token.
    app.include_router(health.metrics_router, prefix=settings.api_prefix)

    # Everything else requires a valid access token.
    protected = [Depends(get_current_user)]
    app.include_router(stacks.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(execution_profiles.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(registry.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(language_domains.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(language_model.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(framework_specialists.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(infrastructure.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(infra_cost.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(features.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(automations.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(marketplace.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(templates.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(tenants.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(skills.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(agent_foundation.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(system_status.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(system_presence.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(runtime.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(roadmap.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(projects.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(downloads.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(engineering_lab.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(blueprints.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(architectural_graph.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(dependency_graph.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(engineering_readiness.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(generation_handoff.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(generated_project_quality.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(backend_generation.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(local_generation.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(system_design_visualization.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(prompt_master.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(gatekeeper.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(user_ai_keys.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(user_preferences.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(llm_settings.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(git_export.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(git_providers.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(contracts.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(meta_factory.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(modernize.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(project_rooms.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(missions.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(mission_deliverable_jobs.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(generation_notifications.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(change_requests.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(live_preview.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(staging.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(billing.router, prefix=settings.api_prefix, dependencies=protected)
    # Plan catalog is public (vault: "Rotas públicas: /{locale}/pricing" -- a
    # visitor sees pricing before signing up); trial/subscription state is not.
    app.include_router(billing_catalog.public_router, prefix=settings.api_prefix)
    app.include_router(billing_catalog.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(student_eligibility.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(test_runner.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(ai_status.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(activity_feed.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(analytics.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(documentation.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(deep_engineering.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(observability.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(permissions.router, prefix=settings.api_prefix, dependencies=protected)
    app.include_router(sandbox_policy_exceptions.router, prefix=settings.api_prefix, dependencies=protected)
    return app


app = create_application()

