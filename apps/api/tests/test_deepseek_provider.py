from __future__ import annotations

import pytest

from app.data.model_registry import MODEL_REGISTRY, resolve_model
from app.engines.llm.base import LLMError
from app.engines.llm.deepseek_adapter import DeepSeekAdapter
from app.engines.llm.router import LLMRouter
from app.schemas.llm import LLMRequest, LLMResponse, Provider
from app.services.ai_availability import available_providers
from app.services.user_key_session_service import UserKeySessionService


class _Msg:
    def __init__(self, content):
        self.content = content


class _Choice:
    def __init__(self, content):
        self.message = _Msg(content)
        self.finish_reason = "stop"


class _Usage:
    prompt_tokens = 11
    completion_tokens = 7


class _Resp:
    def __init__(self, content, model):
        self.choices = [_Choice(content)]
        self.model = model
        self.usage = _Usage()


class _Completions:
    def __init__(self, content, model):
        self._c, self._m = content, model
        self.seen = None

    def create(self, **kwargs):
        self.seen = kwargs
        return _Resp(self._c, self._m)


class _FakeClient:
    def __init__(self, content="hi", model="deepseek-chat"):
        self.chat = type("Chat", (), {"completions": _Completions(content, model)})()


def test_registry_has_deepseek_models_on_deepseek_provider():
    assert MODEL_REGISTRY["deepseek-chat"]["provider"] == "deepseek"
    assert MODEL_REGISTRY["deepseek-reasoner"]["provider"] == "deepseek"
    # An explicit DeepSeek choice is honored by the resolver.
    assert resolve_model(user_choice="deepseek-chat") == "deepseek-chat"


def test_deepseek_builds_openai_style_params_and_parses_json():
    client = _FakeClient(content='{"ok": true}')
    adapter = DeepSeekAdapter(client=client)
    resp = adapter.complete(
        "deepseek-chat",
        LLMRequest(system="s", user="u", json_schema={"type": "object"}, max_output_tokens=2048),
    )
    sent = client.chat.completions.seen
    assert sent["max_tokens"] == 2048
    assert sent["response_format"] == {"type": "json_object"}
    assert resp.provider == Provider.deepseek
    assert resp.parsed == {"ok": True}


def test_deepseek_without_any_key_raises_actionable_error(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    adapter = DeepSeekAdapter()
    with pytest.raises(LLMError) as exc:
        adapter.complete("deepseek-chat", LLMRequest(system="s", user="u"))
    assert "DeepSeek key" in str(exc.value)


def test_router_dispatches_deepseek_with_user_key():
    captured = {}

    class _Stub:
        def complete(self, model, req, *, api_key=None):
            captured["api_key"] = api_key
            captured["model"] = model
            return LLMResponse(provider=Provider.deepseek, model=model, text="ok")

    router = LLMRouter(adapters={"deepseek": _Stub()})
    out = router.route(LLMRequest(system="s", user="u"), user_choice="deepseek-chat", api_key="sk-deepseek-xyz")
    assert out.text == "ok"
    assert captured["api_key"] == "sk-deepseek-xyz"  # user key forwarded to the adapter
    assert captured["model"] == "deepseek-chat"


def test_user_key_vault_accepts_deepseek_provider():
    vault = UserKeySessionService()
    masked = vault.set("user_d", "deepseek", "sk-deepseek-1234567890")
    assert vault.get("user_d", "deepseek") == "sk-deepseek-1234567890"
    assert ("deepseek", masked) in vault.status("user_d")
    # The vault resolves the key for a DeepSeek model choice.
    assert vault.resolve_for_model_choice("user_d", "deepseek-chat") == "sk-deepseek-1234567890"


def test_ai_availability_counts_server_deepseek_key(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-server-deepseek")
    from app.core.config import get_settings

    get_settings.cache_clear()
    try:
        assert "deepseek" in available_providers()
    finally:
        monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
        get_settings.cache_clear()
