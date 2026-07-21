from __future__ import annotations

import pytest

from app.engines.llm.base import LLMAdapter, LLMError
from app.engines.llm.router import LLMRouter
from app.schemas.llm import LLMRequest, LLMResponse, Provider
from app.services.ai_key_vault_service import ai_key_vault_service
from app.repositories.user_ai_key_repository import UserAiKeyRepository

RAW_KEY = "sk-ant-supersecret-key-value-1234"


# --- vault unit -------------------------------------------------------------- #

def test_vault_masks_and_never_exposes_raw_key(client):
    del client  # only needed to trigger the isolated per-test DB fixture
    repo = UserAiKeyRepository()
    row = repo.create("user_a", "anthropic", "Minha chave", RAW_KEY)
    assert RAW_KEY not in row["masked"]
    assert row["masked"].endswith(RAW_KEY[-4:])
    # list_for_user carries only masked tails, never the raw key.
    listed = repo.list_for_user("user_a")
    assert [r["masked"] for r in listed] == [row["masked"]]
    assert all(RAW_KEY not in r["masked"] for r in listed)
    # get_decrypted returns the plaintext only for client-build time.
    assert repo.get_decrypted("user_a", row["id"]) == RAW_KEY


def test_vault_isolates_users_and_supports_deletion(client):
    del client
    repo = UserAiKeyRepository()
    row = repo.create("user_a", "openai", "Chave", RAW_KEY)
    assert repo.list_for_user("user_b") == []  # isolation
    assert repo.delete("user_a", row["id"]) is True
    assert repo.list_for_user("user_a") == []


def test_first_key_for_a_provider_becomes_its_default(client):
    del client
    repo = UserAiKeyRepository()
    first = repo.create("user_a", "openai", "Primeira", RAW_KEY)
    second = repo.create("user_a", "openai", "Segunda", "sk-second-key-1234")
    assert first["is_default"] is True
    assert second["is_default"] is False


def test_deleting_the_default_key_promotes_the_next_active_one(client):
    del client
    repo = UserAiKeyRepository()
    first = repo.create("user_a", "openai", "Primeira", RAW_KEY)
    second = repo.create("user_a", "openai", "Segunda", "sk-second-key-1234")
    repo.delete("user_a", first["id"])
    remaining = repo.list_for_user("user_a")
    assert len(remaining) == 1
    assert remaining[0]["id"] == second["id"]
    assert remaining[0]["is_default"] is True


def test_set_default_switches_the_active_key(client):
    del client
    repo = UserAiKeyRepository()
    first = repo.create("user_a", "openai", "Primeira", RAW_KEY)
    second = repo.create("user_a", "openai", "Segunda", "sk-second-key-1234")
    repo.set_default("user_a", second["id"])
    assert repo.get_default_for_provider("user_a", "openai")["id"] == second["id"]
    listed = {r["id"]: r["is_default"] for r in repo.list_for_user("user_a")}
    assert listed[first["id"]] is False
    assert listed[second["id"]] is True


# --- router behaviour with a user key --------------------------------------- #

class _RecordingAdapter(LLMAdapter):
    def __init__(self):
        self.received_key: str | None = "UNSET"

    def complete(self, model, req, *, api_key=None):  # noqa: ANN001
        self.received_key = api_key
        return LLMResponse(provider=Provider.anthropic, model=model, text="ok")


class _BadKeyAdapter(LLMAdapter):
    def complete(self, model, req, *, api_key=None):  # noqa: ANN001
        raise LLMError("401 invalid api key")


def test_router_passes_user_key_to_adapter():
    adapter = _RecordingAdapter()
    router = LLMRouter(adapters={"anthropic": adapter, "openai": adapter, "google": adapter})
    router.route(LLMRequest(system="s", user="u"), api_key=RAW_KEY)
    assert adapter.received_key == RAW_KEY


class _SpecRecordingAdapter(LLMAdapter):
    def __init__(self):
        self.received_model: str | None = None
        self.received_key: str | None = "UNSET"

    def complete(self, model, req, *, api_key=None):  # noqa: ANN001
        self.received_model = model
        self.received_key = api_key
        return LLMResponse(
            provider=Provider.google, model=model, text="{}",
            parsed={"raw_intent": "x", "confidence": 0.95},
        )


def test_orchestrator_routes_user_key_to_chosen_provider():
    # Regression: choosing Gemini must route the orchestrator stage to Google and
    # use the Google key — not the default anthropic role hint (which previously
    # handed a Google key to the Anthropic adapter -> 401).
    from app.engines.orchestrator_engine import run_orchestrator

    google_adapter = _SpecRecordingAdapter()
    router = LLMRouter(
        adapters={"anthropic": _BadKeyAdapter(), "openai": _BadKeyAdapter(), "google": google_adapter}
    )
    run_orchestrator("ideia", router=router, user_model_choice="gemini-2.5-pro", api_key="gkey")
    assert google_adapter.received_model == "gemini-2.5-pro"
    assert google_adapter.received_key == "gkey"


def test_router_user_key_failure_is_not_silently_mocked():
    router = LLMRouter(
        adapters={"anthropic": _BadKeyAdapter(), "openai": _BadKeyAdapter(), "google": _BadKeyAdapter()}
    )
    # A bad user key must surface, not fall back to the mock.
    with pytest.raises(LLMError):
        router.route(LLMRequest(system="s", user="u"), api_key="bad-key")


# --- HTTP endpoints ---------------------------------------------------------- #

def _create_key(client, provider="anthropic", nome="Minha chave", api_key=RAW_KEY):
    return client.post("/api/user-ai-keys", json={"provider": provider, "nome": nome, "api_key": api_key})


def test_crud_endpoints_roundtrip_without_echoing_key(client):
    created = _create_key(client)
    assert created.status_code == 201, created.text
    body = created.json()
    assert RAW_KEY not in created.text  # never echoed
    assert body["provider"] == "anthropic"
    assert body["masked"].endswith(RAW_KEY[-4:])
    assert body["is_default"] is True
    key_id = body["id"]

    listed = client.get("/api/user-ai-keys").json()
    assert RAW_KEY not in str(listed)
    assert {row["provider"] for row in listed["keys"]} == {"anthropic"}

    assert client.delete(f"/api/user-ai-keys/{key_id}").status_code == 204
    assert client.get("/api/user-ai-keys").json()["keys"] == []


def test_second_key_for_same_provider_does_not_replace_the_first(client):
    _create_key(client, nome="Primeira")
    second = _create_key(client, nome="Segunda", api_key="sk-ant-second-secret-5678")
    assert second.status_code == 201
    keys = client.get("/api/user-ai-keys").json()["keys"]
    assert len(keys) == 2
    assert {row["nome"] for row in keys} == {"Primeira", "Segunda"}


def test_duplicate_key_name_for_same_provider_is_rejected(client):
    _create_key(client, nome="Minha chave")
    duplicate = _create_key(client, nome="Minha chave", api_key="sk-ant-another-secret-5678")
    assert duplicate.status_code == 409


def test_set_default_endpoint_switches_which_key_is_active(client):
    first = _create_key(client, nome="Primeira").json()
    second = _create_key(client, nome="Segunda", api_key="sk-ant-second-secret-5678").json()
    response = client.post(f"/api/user-ai-keys/{second['id']}/set-default")
    assert response.status_code == 200
    assert response.json()["is_default"] is True
    keys = {row["id"]: row["is_default"] for row in client.get("/api/user-ai-keys").json()["keys"]}
    assert keys[first["id"]] is False
    assert keys[second["id"]] is True


def test_generate_with_use_user_key_but_no_key_registered_errors(client):
    # Asking to use my key without having registered one is a clear 400, never a
    # silent server-key or mock run. The key check runs before any LLM call, so a
    # minimal spec is enough to reach it.
    resp = client.post(
        "/api/meta-factory/generate",
        json={"spec": {"raw_intent": "API simples."}, "project_name": "x", "persist": False, "use_user_key": True},
    )
    assert resp.status_code == 400
    assert "key" in resp.text.lower()


def test_test_key_endpoint_validates_without_persisting_or_echoing(client, monkeypatch):
    from app.engines.llm.router import LLMRouter

    def fake_route(self, req, *, user_choice=None, agent_role=None, api_key=None):  # noqa: ANN001
        assert api_key == RAW_KEY
        return LLMResponse(provider=Provider.anthropic, model=user_choice or "claude-haiku-4-5", text="ok")

    monkeypatch.setattr(LLMRouter, "route", fake_route)
    resp = client.post("/api/user-ai-keys/test", json={"provider": "anthropic", "api_key": RAW_KEY})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is True
    assert body["http_status"] == 200
    assert RAW_KEY not in resp.text
    # A connectivity test never persists a row.
    assert client.get("/api/user-ai-keys").json()["keys"] == []


def test_ensure_ready_raises_when_no_active_key(client):
    del client
    from app.services.ai_key_vault_service import NoAiKeyConfiguredError

    with pytest.raises(NoAiKeyConfiguredError):
        ai_key_vault_service.ensure_ready("user_without_keys", "anthropic")
