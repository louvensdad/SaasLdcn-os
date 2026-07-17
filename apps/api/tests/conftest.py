from __future__ import annotations

import sys
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.core import deps as auth_deps
from app.core.config import get_settings
from app.core.database import Base, database_url_for, get_engine
import app.models  # noqa: F401
from app.main import create_application
from app.repositories.download_repository import DownloadRepository
from app.repositories.llm_active_selection_repository import LlmActiveSelectionRepository
from app.repositories.platform_runtime_config_repository import PlatformRuntimeConfigRepository
from app.repositories.user_preferences_repository import UserPreferencesRepository
from app.repositories.user_repository import AuditLogRepository, UserRepository
from app.repositories.modernize_job_repository import ModernizeJobRepository
from app.repositories.project_room_repository import ProjectRoomRepository
from app.repositories.git_provider_repository import GitProviderRepository
from app.routes import downloads as downloads_route
from app.routes import local_generation as local_generation_route
from app.routes import meta_factory as meta_factory_route
from app.routes import modernize as modernize_route
from app.routes import project_rooms as project_rooms_route
from app.routes import prompt_master as prompt_master_route
from app.routes.auth import service as auth_route_service
from app.routes.projects import service as project_route_service
from app.services.download_service import DownloadService
from app.services.git_provider_service import git_provider_service
from app.services.llm_settings_service import llm_settings_service
from app.services.platform_runtime_config_service import platform_runtime_config_service
from app.services.project_service import ProjectService
from app.services.user_preferences_service import user_preferences_service


@pytest.fixture
def project_requirements() -> dict:
    return {
        "project_goal": "Deliver a governed business application.",
        "business_context": "Commercial SaaS operation with explicit user workflows.",
        "target_users": ["operators", "customers"],
        "business_rules": ["Only authorized users may change protected records."],
        "entities": ["User", "Account", "Record"],
        "workflows": ["User submits a request and an operator reviews it."],
        "constraints": ["Do not expose secrets or personal data."],
        "delivery_target": "github",
    }


@pytest.fixture
def client() -> TestClient:
    temp_dir = API_ROOT / "tests" / ".tmp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    database_path = temp_dir / f"test_ldcn_os_{uuid4().hex}.db"
    get_settings.cache_clear()
    settings = get_settings()
    settings.sqlite_path = database_path
    settings.database_url = database_url_for(database_path)
    Base.metadata.create_all(bind=get_engine(settings.database_url))
    isolated_service = ProjectService()
    project_route_service.project_repository = isolated_service.project_repository
    project_route_service.catalog_repository = isolated_service.catalog_repository

    # The prompt-master route holds its own module-level ProjectRepository
    # (bound to the default DB at import time), so point it at the same
    # isolated per-test database used by the projects route above.
    prompt_master_route.project_repository = isolated_service.project_repository

    # The project-rooms route holds its own module-level ProjectRoomService bound to
    # the default DB at import time; point it at the isolated per-test database too.
    # (Done before the app/lifespan starts so initialize() targets this DB.)
    project_rooms_route.service.repository = ProjectRoomRepository(database_path)
    modernize_route._jobs_repo = ModernizeJobRepository(database_path)
    isolated_download_service = DownloadService(DownloadRepository(database_path))
    downloads_route.service = isolated_download_service
    local_generation_route.download_service = isolated_download_service
    meta_factory_route._download_service = isolated_download_service

    # Point the auth system (used to protect every non-public route) at the
    # same isolated, per-test SQLite database.
    isolated_user_repository = UserRepository(database_path)
    auth_route_service.user_repository = isolated_user_repository
    auth_route_service.audit_repository = AuditLogRepository(database_path)
    auth_deps.configure_user_repository(isolated_user_repository)

    # These are module-level singletons constructed at import time (before this
    # fixture repoints get_settings().database_url), so their repositories must
    # be explicitly repointed at the isolated per-test database too -- otherwise
    # every test would read/write the same shared default DB file. Mutating the
    # attribute in place (rather than rebinding a route module's imported name)
    # ensures every module that imported the singleton by reference -- e.g.
    # git_export_engine's `from ... import git_provider_service` -- sees the
    # swap too, not just whichever module conftest happens to reassign.
    llm_settings_service.repository = LlmActiveSelectionRepository(database_path)
    user_preferences_service.repository = UserPreferencesRepository(database_path)
    platform_runtime_config_service.repository = PlatformRuntimeConfigRepository(database_path)
    git_provider_service._storage = GitProviderRepository(database_path)

    app = create_application()
    with TestClient(app) as test_client:
        # Most routes now require authentication. Register a throwaway user
        # for this test run and attach its access token to every request the
        # test makes, so existing tests that don't set up auth themselves
        # keep working unchanged.
        register_response = test_client.post(
            "/api/auth/register",
            json={
                "email": f"test_{uuid4().hex}@example.com",
                "password": "TestPassword123!",
                "full_name": "Test User",
                "privacy_policy_accepted": True,
            },
        )
        access_token = register_response.json()["tokens"]["access_token"]
        test_client.headers.update({"Authorization": f"Bearer {access_token}"})
        yield test_client
    get_engine(settings.database_url).dispose()
    if database_path.exists():
        database_path.unlink()
