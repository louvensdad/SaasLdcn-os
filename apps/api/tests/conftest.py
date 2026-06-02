from __future__ import annotations

import sys
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.core.config import get_settings
from app.main import create_application
from app.routes.projects import service as project_route_service
from app.services.project_service import ProjectService


@pytest.fixture
def client() -> TestClient:
    temp_dir = API_ROOT / "tests" / ".tmp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    database_path = temp_dir / f"test_ldcn_os_{uuid4().hex}.db"
    get_settings.cache_clear()
    settings = get_settings()
    settings.sqlite_path = database_path
    isolated_service = ProjectService()
    project_route_service.project_repository = isolated_service.project_repository
    project_route_service.catalog_repository = isolated_service.catalog_repository
    app = create_application()
    with TestClient(app) as test_client:
        yield test_client
    if database_path.exists():
        database_path.unlink()
