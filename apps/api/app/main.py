from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import get_settings
from app.core.cors import configure_cors
from app.core.exceptions import configure_exception_handlers
from app.core.logging import RequestLoggingMiddleware, logger
from app.routes import (
    architectural_graph,
    blueprints,
    contracts,
    dependency_graph,
    downloads,
    engineering_readiness,
    generation_handoff,
    git_export,
    infrastructure,
    framework_specialists,
    gatekeeper,
    health,
    language_domains,
    local_generation,
    projects,
    prompt_master,
    registry,
    roadmap,
    stacks,
    skills,
    system_status,
    system_design_visualization,
    templates,
    user_ai_keys,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    projects.service.initialize()
    logger.info("Project repository initialized at %s", get_settings().sqlite_path)
    yield


def create_application() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        debug=settings.debug,
        lifespan=lifespan,
    )
    configure_cors(app)
    configure_exception_handlers(app)
    app.add_middleware(RequestLoggingMiddleware)
    app.include_router(health.router, prefix=settings.api_prefix)
    app.include_router(stacks.router, prefix=settings.api_prefix)
    app.include_router(registry.router, prefix=settings.api_prefix)
    app.include_router(language_domains.router, prefix=settings.api_prefix)
    app.include_router(framework_specialists.router, prefix=settings.api_prefix)
    app.include_router(infrastructure.router, prefix=settings.api_prefix)
    app.include_router(templates.router, prefix=settings.api_prefix)
    app.include_router(skills.router, prefix=settings.api_prefix)
    app.include_router(system_status.router, prefix=settings.api_prefix)
    app.include_router(roadmap.router, prefix=settings.api_prefix)
    app.include_router(projects.router, prefix=settings.api_prefix)
    app.include_router(downloads.router, prefix=settings.api_prefix)
    app.include_router(blueprints.router, prefix=settings.api_prefix)
    app.include_router(architectural_graph.router, prefix=settings.api_prefix)
    app.include_router(dependency_graph.router, prefix=settings.api_prefix)
    app.include_router(engineering_readiness.router, prefix=settings.api_prefix)
    app.include_router(generation_handoff.router, prefix=settings.api_prefix)
    app.include_router(local_generation.router, prefix=settings.api_prefix)
    app.include_router(system_design_visualization.router, prefix=settings.api_prefix)
    app.include_router(prompt_master.router, prefix=settings.api_prefix)
    app.include_router(gatekeeper.router, prefix=settings.api_prefix)
    app.include_router(user_ai_keys.router, prefix=settings.api_prefix)
    app.include_router(git_export.router, prefix=settings.api_prefix)
    app.include_router(contracts.router, prefix=settings.api_prefix)
    return app


app = create_application()
