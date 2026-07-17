from __future__ import annotations

import pytest

from app.services.llm_provider_registry import normalize_provider_id
from app.services.llm_settings_service import LlmSettingsService
from app.services.user_key_session_service import user_key_session

KEY = "sk-test-global-provider-secret-1234"


@pytest.fixture(autouse=True)
def clear_global_state():
    user_key_session.clear("resolver-user")
    yield
    user_key_session.clear("resolver-user")


@pytest.mark.parametrize(
    ("alias", "canonical"),
    [
        ("OpenAI", "openai"),
        ("GPT", "openai"),
        ("Claude", "anthropic"),
        ("gemini", "google"),
        ("google_genai", "google"),
        ("DeepSeek", "deepseek"),
        ("open-router", "openrouter"),
        ("local", "ollama"),
    ],
)
def test_provider_ids_are_canonical(alias: str, canonical: str):
    assert normalize_provider_id(alias) == canonical


def test_configured_claude_is_the_safe_active_setting(client):
    response = client.post(
        "/api/user-ai-keys/session", json={"provider": "anthropic", "api_key": KEY}
    )
    assert response.status_code == 200

    active = client.get("/api/llm/settings/active")
    assert active.status_code == 200
    body = active.json()
    assert body["provider"] == "anthropic"
    assert body["providerLabel"] == "Claude"
    assert body["model"] == "claude-sonnet-4-6"
    assert body["hasKey"] is True
    assert body["status"] == "ready"
    assert body["mode"] == "llm"
    assert "apiKey" not in active.text
    assert KEY not in active.text


def test_cache_stats_reflect_real_counters_not_fabricated_data(client):
    from app.core.metrics import LLM_CACHE_EVENTS

    before = client.get("/api/llm/cache-stats").json()
    LLM_CACHE_EVENTS.labels(outcome="hit").inc()
    after = client.get("/api/llm/cache-stats").json()

    assert after["hits"] == before["hits"] + 1
    # No tokens/cost/most-used-model fields -- none of that is tracked anywhere.
    assert set(after.keys()) == {"hits", "misses", "stored", "evicted", "expired", "oversized", "entries", "bytes"}


def test_no_provider_returns_explained_deterministic_state(client):
    client.delete("/api/user-ai-keys/session")
    body = client.get("/api/llm/settings/active").json()
    assert body["provider"] is None
    assert body["mode"] == "deterministic"
    assert body["status"] == "not_configured"
    assert "Nenhum LLM" in body["reason"]


def test_switching_default_updates_global_resolution(client):
    client.post("/api/user-ai-keys/session", json={"provider": "anthropic", "api_key": KEY})
    client.post("/api/user-ai-keys/session", json={"provider": "openai", "api_key": KEY})
    selected = client.put(
        "/api/llm/settings/active", json={"provider": "openai", "model": "gpt-4.1"}
    )
    assert selected.status_code == 200
    assert selected.json()["provider"] == "openai"
    resolution = client.post(
        "/api/llm/settings/confirm",
        json={"requestedCapability": "architecture_analysis", "mode": "llm"},
    ).json()
    assert resolution["provider"] == "openai"
    assert resolution["model"] == "gpt-4.1"
    assert resolution["fallbackUsed"] is False


@pytest.mark.parametrize(
    "capability",
    [
        "project_room",
        "prompt_master_generation",
        "prompt_master_revision",
        "architect_engine",
        "blueprint_generation",
        "engineering_review",
        "meta_factory_agents",
        "documentation_ai_writer",
        "modernize",
        "laboratory_ai_assistant",
        "auto_repair",
        "codebase_analysis",
        "security_analysis",
        "architecture_analysis",
    ],
)
def test_every_capability_resolves_the_same_active_provider(capability: str, client):
    # `client` is unused directly but its fixture points get_settings().database_url
    # at an isolated, table-initialized per-test SQLite DB -- LlmSettingsService()
    # below persists the active selection there, not into the shared dev DB.
    del client
    user_key_session.set("resolver-user", "anthropic", KEY)
    service = LlmSettingsService()
    service.configured("resolver-user", "anthropic")
    context = service.resolve(
        workspace_id="workspace-a",
        user_id="resolver-user",
        requested_capability=capability,
    )
    assert context.resolution.provider == "anthropic"
    assert context.resolution.mode == "llm"
    assert context.resolution.fallbackUsed is False
    assert context.api_key == KEY


def test_expired_key_is_explicit_and_never_silently_ready(client):
    del client  # see comment in test_every_capability_resolves_the_same_active_provider
    service = LlmSettingsService()
    service.configured("resolver-user", "anthropic")
    context = service.resolve(
        workspace_id=None,
        user_id="resolver-user",
        requested_capability="documentation_ai_writer",
    )
    assert context.resolution.mode == "deterministic"
    assert context.resolution.keyStatus == "expired"
    assert context.resolution.fallbackUsed is True
    assert "ausente ou expirada" in context.resolution.reason


def test_deterministic_choice_is_audited(client):
    response = client.post(
        "/api/llm/settings/confirm",
        json={"requestedCapability": "modernize", "mode": "deterministic"},
    )
    assert response.status_code == 200
    assert response.json()["fallbackUsed"] is True
    exported = client.get("/api/auth/me/export").json()
    event_codes = {event["event_code"] for event in exported["audit_events"]}
    assert "LLM_FALLBACK_DETERMINISTIC_USED" in event_codes


def test_valid_provider_never_falls_back_silently(client):
    """Rule: no module may resolve to deterministic while a valid global
    provider exists, unless the user explicitly asked for it."""
    del client  # see comment in test_every_capability_resolves_the_same_active_provider
    user_key_session.set("resolver-user", "anthropic", KEY)
    service = LlmSettingsService()
    service.configured("resolver-user", "anthropic")
    context = service.resolve(
        workspace_id=None,
        user_id="resolver-user",
        requested_capability="meta_factory_agents",
    )
    assert context.resolution.mode == "llm"
    assert context.resolution.fallbackUsed is False


def test_mismatched_model_falls_back_to_configured_provider(client):
    """If a model picker passes a model from a provider with no key, the flow
    must still auto-use the configured (keyed) provider, not go deterministic."""
    del client  # see comment in test_every_capability_resolves_the_same_active_provider
    user_key_session.set("resolver-user", "anthropic", KEY)
    service = LlmSettingsService()
    service.configured("resolver-user", "anthropic")
    # 'gpt-4.1' maps to openai, which has no key for this user.
    context = service.resolve(
        workspace_id=None,
        user_id="resolver-user",
        requested_capability="meta_factory_agents",
        requested_model="gpt-4.1",
    )
    assert context.resolution.mode == "llm"
    assert context.resolution.provider == "anthropic"
    assert context.resolution.fallbackUsed is False
    assert context.api_key == KEY


def test_confirm_response_never_leaks_the_api_key(client):
    """Security regression: the confirm payload and its audit trail must never
    echo the secret, in any casing or field name."""
    client.post("/api/user-ai-keys/session", json={"provider": "anthropic", "api_key": KEY})
    response = client.post(
        "/api/llm/settings/confirm",
        json={"requestedCapability": "engineering_review", "mode": "llm"},
    )
    assert response.status_code == 200
    assert response.json()["fallbackUsed"] is False
    assert KEY not in response.text
    assert "api_key" not in response.text
    assert "apiKey" not in response.text
