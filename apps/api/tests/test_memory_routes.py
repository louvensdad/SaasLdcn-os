from __future__ import annotations

from app.core.config import get_settings
from app.repositories.memory_repository import MemoryRepository


def _create_room(client) -> str:
    # No raw_intent -- an empty one skips the orchestrator turn at creation
    # time (see ProjectRoomService.create_room), so these tests start from a
    # clean memory slate instead of also containing a real assumption-derived
    # memory from that turn (a genuine, separately-covered behavior).
    response = client.post("/api/project-rooms", json={"title": "Memory Route Test", "raw_intent": ""})
    assert response.status_code == 201
    return response.json()["room_id"]


def _seed_memory(room_id: str, owner_user_id: str, **overrides) -> dict:
    defaults = dict(
        owner_user_id=owner_user_id, scope_type="project", scope_id=room_id,
        memory_type="fact", content="Prefere PIX", origin="test_origin", confidence=0.6,
    )
    defaults.update(overrides)
    return MemoryRepository(get_settings().sqlite_path).create(**defaults)


def test_list_memories_returns_only_this_rooms_active_memories(client):
    owner = client.get("/api/auth/me").json()["user_id"]
    room_id = _create_room(client)
    other_room = _create_room(client)
    _seed_memory(room_id, owner)
    _seed_memory(other_room, owner, origin="other")

    response = client.get(f"/api/project-rooms/{room_id}/memories")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["scope_id"] == room_id


def test_list_memories_404s_for_an_unknown_room(client):
    response = client.get("/api/project-rooms/does-not-exist/memories")
    assert response.status_code == 404


def test_correct_memory_creates_a_new_active_row_and_marks_the_old_one_corrected(client):
    owner = client.get("/api/auth/me").json()["user_id"]
    room_id = _create_room(client)
    memory = _seed_memory(room_id, owner)

    response = client.put(f"/api/project-rooms/{room_id}/memories/{memory['id']}", json={"content": "Prefere boleto"})
    assert response.status_code == 200
    corrected = response.json()
    assert corrected["content"] == "Prefere boleto"
    assert corrected["corrected_from_id"] == memory["id"]

    listed = client.get(f"/api/project-rooms/{room_id}/memories").json()
    assert len(listed) == 1
    assert listed[0]["content"] == "Prefere boleto"


def test_correcting_an_already_corrected_memory_is_a_conflict(client):
    owner = client.get("/api/auth/me").json()["user_id"]
    room_id = _create_room(client)
    memory = _seed_memory(room_id, owner)
    client.put(f"/api/project-rooms/{room_id}/memories/{memory['id']}", json={"content": "v2"})

    response = client.put(f"/api/project-rooms/{room_id}/memories/{memory['id']}", json={"content": "v3"})
    assert response.status_code == 409


def test_delete_memory_soft_deletes_and_excludes_it_from_listing(client):
    owner = client.get("/api/auth/me").json()["user_id"]
    room_id = _create_room(client)
    memory = _seed_memory(room_id, owner)

    response = client.delete(f"/api/project-rooms/{room_id}/memories/{memory['id']}")
    assert response.status_code == 200
    assert response.json()["status"] == "deleted"
    assert client.get(f"/api/project-rooms/{room_id}/memories").json() == []


def test_deleting_an_already_deleted_memory_is_a_conflict(client):
    owner = client.get("/api/auth/me").json()["user_id"]
    room_id = _create_room(client)
    memory = _seed_memory(room_id, owner)
    client.delete(f"/api/project-rooms/{room_id}/memories/{memory['id']}")

    response = client.delete(f"/api/project-rooms/{room_id}/memories/{memory['id']}")
    assert response.status_code == 409


def test_memory_from_a_different_room_is_not_reachable_through_this_room(client):
    owner = client.get("/api/auth/me").json()["user_id"]
    room_id = _create_room(client)
    other_room = _create_room(client)
    memory = _seed_memory(other_room, owner)

    response = client.put(f"/api/project-rooms/{room_id}/memories/{memory['id']}", json={"content": "x"})
    assert response.status_code == 404


def test_memory_owned_by_a_different_user_is_not_reachable(client):
    room_id = _create_room(client)
    memory = _seed_memory(room_id, "someone-else")

    response = client.delete(f"/api/project-rooms/{room_id}/memories/{memory['id']}")
    assert response.status_code == 404


def test_creating_a_room_with_a_real_intent_records_a_real_assumption_memory(client):
    """End-to-end wiring proof (project_room_service._orchestrator_turn ->
    memory_engine.promote_assumptions -> record_memories): a room created
    WITH an intent runs the orchestrator turn, whose materialized assumptions
    become real, origin-cited memories -- not a mock/stub of the pipeline."""
    created = client.post("/api/project-rooms", json={"title": "Real Intent Room", "raw_intent": "loja de roupas online"})
    assert created.status_code == 201
    room_id = created.json()["room_id"]

    memories = client.get(f"/api/project-rooms/{room_id}/memories").json()
    assert len(memories) >= 1
    assert all(m["memory_type"] == "assumption" for m in memories)
    assert all(m["origin"].startswith("orchestrator_assumption:") for m in memories)
