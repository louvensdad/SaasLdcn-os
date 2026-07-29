from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

import pytest

import app.models  # noqa: F401
from app.engines.generation_job_engine import GenerationJobEngine
from app.repositories.blueprint_approval_repository import BlueprintApprovalRepository
from app.repositories.generation_job_repository import GenerationJobRepository
from app.repositories.project_room_repository import ProjectRoomRepository
from app.schemas.orchestrator import ProjectSpec


@pytest.fixture
def isolated_engine(client):
    # Bound to the SAME database as `client` (unlike test_generation_job_pipeline.py's
    # fixture of the same name, which is deliberately a separate DB) -- every test
    # in this file creates workspace/room state through the real client/auth flow,
    # and GenerationJobRepository.create() checks workspace membership against its
    # own DB, so the two must be the same one here.
    from app.core.config import get_settings

    checkpoint_root = Path(tempfile.mkdtemp(prefix="ldcn-blueprint-governance-"))
    repository = GenerationJobRepository(get_settings().sqlite_path)
    engine = GenerationJobEngine(repository, checkpoint_root)
    try:
        yield engine
    finally:
        shutil.rmtree(checkpoint_root, ignore_errors=True)


def _spec_payload() -> dict:
    return ProjectSpec(
        raw_intent="Sistema de pedidos",
        product_summary="Operacao de pedidos auditavel",
        entities=["Order"],
        business_rules=["Somente operadores aprovam pedidos"],
        core_workflows=["Criar e aprovar pedido"],
    ).model_dump(mode="json")


def _create_room(client, *, status: str, blueprint: dict | None = None) -> tuple[str, str]:
    """Create a room for the current test user's own DB, bypassing the LLM
    orchestrator, and force it into the given workflow status."""
    from app.routes import project_rooms as project_rooms_route

    user_id = client.get("/api/auth/me").json()["user_id"]
    repository: ProjectRoomRepository = project_rooms_route.service.repository
    room = repository.create(owner_user_id=user_id, title="Governed Project")
    if blueprint is not None:
        repository.set_blueprint(room["room_id"], user_id, blueprint)
    repository.update_status(room["room_id"], user_id, status)
    return room["room_id"], user_id


def _job_payload(project_id: str) -> dict:
    return {
        "projectId": project_id,
        "projectName": "Governed Project",
        "spec": _spec_payload(),
        "blueprint": {"decisions": []},
        "blueprintVersion": 1,
        "mode": "deterministic",
    }


def test_job_creation_blocked_before_engineering_review(client, isolated_engine, monkeypatch):
    from app.routes import meta_factory as route

    monkeypatch.setattr(route, "generation_job_engine", isolated_engine)
    monkeypatch.setattr(isolated_engine, "start", lambda *args, **kwargs: None)

    room_id, _ = _create_room(client, status="UNDER_REVIEW")
    response = client.post("/api/meta-factory/jobs", json=_job_payload(room_id))

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "BLUEPRINT_GATE_BLOCKED"
    assert isolated_engine.latest(room_id, "any-user") is None


def test_job_creation_allowed_after_engineering_approval(client, isolated_engine, monkeypatch):
    from app.routes import meta_factory as route

    monkeypatch.setattr(route, "generation_job_engine", isolated_engine)
    monkeypatch.setattr(isolated_engine, "start", lambda *args, **kwargs: None)

    # An approved room also needs the user's explicit stack approval (Stack
    # Approval Gate) before generation can start.
    blueprint = {"decisions": [], "stack_approval": {"status": "APPROVED"}}
    room_id, _ = _create_room(client, status="ENGINEERING_APPROVED", blueprint=blueprint)
    response = client.post("/api/meta-factory/jobs", json=_job_payload(room_id))

    assert response.status_code == 202


def test_job_creation_without_a_matching_room_is_not_gated(client, isolated_engine, monkeypatch):
    """projectId that doesn't resolve to any Project Room of the caller's (ad-hoc /
    direct API usage) must not be blocked -- only real, unapproved rooms are."""
    from app.routes import meta_factory as route

    monkeypatch.setattr(route, "generation_job_engine", isolated_engine)
    monkeypatch.setattr(isolated_engine, "start", lambda *args, **kwargs: None)

    response = client.post("/api/meta-factory/jobs", json=_job_payload("no-such-room"))

    assert response.status_code == 202


def test_acknowledged_preview_blueprint_is_recorded_as_an_approval(client, isolated_engine, monkeypatch):
    from app.routes import meta_factory as route

    monkeypatch.setattr(route, "generation_job_engine", isolated_engine)
    monkeypatch.setattr(isolated_engine, "start", lambda *args, **kwargs: None)

    blueprint = {
        "decisions": [{"area": "backend"}], "degraded": True, "preview_acknowledged": True,
        "stack_approval": {"status": "APPROVED"},
    }
    room_id, _ = _create_room(client, status="ENGINEERING_APPROVED", blueprint=blueprint)

    response = client.post("/api/meta-factory/jobs", json=_job_payload(room_id))
    assert response.status_code == 202

    from app.core.config import get_settings
    from app.repositories.blueprint_approval_repository import hash_blueprint
    from app.routes import project_rooms as project_rooms_route

    user_id = client.get("/api/auth/me").json()["user_id"]
    decorated_room = project_rooms_route.service.get_room(room_id, user_id)
    approvals = BlueprintApprovalRepository(get_settings().sqlite_path)
    assert approvals.is_approved(room_id, hash_blueprint(decorated_room["architecture_blueprint"]))
