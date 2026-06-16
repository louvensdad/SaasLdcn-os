from __future__ import annotations

import pytest

from app.engines.llm.base import LLMAdapter, LLMError
from app.engines.llm.router import LLMRouter
from app.schemas.llm import LLMRequest, LLMResponse, Provider
from app.services.user_key_session_service import UserKeySessionService, user_key_session

RAW_KEY = "sk-ant-supersecret-key-value-1234"


# --- vault unit -------------------------------------------------------------- #

def test_vault_masks_and_never_exposes_raw_key():
    vault = UserKeySessionService()
    masked = vault.set("user_a", "anthropic", RAW_KEY)
    assert RAW_KEY not in masked
    assert masked.endswith(RAW_KEY[-4:])
    # status carries only masked tails, never the raw key.
    status = vault.status("user_a")
    assert status == [("anthropic", masked)]
    assert all(RAW_KEY not in m for _p, m in status)
    # get returns the plaintext only for client-build time.
    assert vault.get("user_a", "anthropic") == RAW_KEY


def test_vault_isolates_users_and_clears():
    vault = UserKeySessionService()
    vault.set("user_a", "openai", RAW_KEY)
    assert vault.get("user_b", "openai") is None  # isolation
    vault.clear("user_a")
    assert vault.get("user_a", "openai") is None


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

def _set_key(client, provider="anthropic", api_key=RAW_KEY):
    return client.post("/api/user-ai-keys/session", json={"provider": provider, "api_key": api_key})


def test_session_endpoints_roundtrip_without_echoing_key(client):
    resp = _set_key(client)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert RAW_KEY not in resp.text  # never echoed
    assert body["sessions"][0]["provider"] == "anthropic"
    assert body["sessions"][0]["masked"].endswith(RAW_KEY[-4:])

    status = client.get("/api/user-ai-keys/status").json()
    assert RAW_KEY not in str(status)
    assert {s["provider"] for s in status["sessions"]} == {"anthropic"}

    assert client.delete("/api/user-ai-keys/session").status_code == 204
    assert client.get("/api/user-ai-keys/status").json()["sessions"] == []


def test_generate_with_use_user_key_but_no_session_errors(client):
    # Asking to use my key without having stored one is a clear 400, never a
    # silent server-key or mock run. The key check runs before any LLM call, so a
    # minimal spec is enough to reach it.
    client.delete("/api/user-ai-keys/session")
    resp = client.post(
        "/api/meta-factory/generate",
        json={"spec": {"raw_intent": "API simples."}, "project_name": "x", "persist": False, "use_user_key": True},
    )
    assert resp.status_code == 400
    assert "key" in resp.text.lower()


@pytest.fixture(autouse=True)
def _clear_global_vault():
    yield
    # Keep the process-global vault clean between HTTP tests.
    user_key_session._vault.clear()  # type: ignore[attr-defined]
