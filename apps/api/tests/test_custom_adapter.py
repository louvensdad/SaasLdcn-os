from __future__ import annotations

import pytest

from app.engines.llm.base import LLMError
from app.engines.llm.custom_adapter import CustomOpenAIAdapter
from app.engines.llm.router import LLMRouter
from app.schemas.llm import LLMRequest, LLMResponse, Provider


class _Msg:
    def __init__(self, content):
        self.content = content


class _Choice:
    def __init__(self, content):
        self.message = _Msg(content)
        self.finish_reason = "stop"


class _Usage:
    prompt_tokens = 5
    completion_tokens = 3


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
    def __init__(self, content="ok", model="my-model"):
        self.chat = type("Chat", (), {"completions": _Completions(content, model)})()


def test_custom_sends_configured_model_and_classic_params():
    client = _FakeClient(content='{"ok": true}', model="my-model")
    adapter = CustomOpenAIAdapter(client=client, base_url="http://localhost:8000/v1", model="my-model")
    resp = adapter.complete(
        "custom",
        LLMRequest(system="s", user="u", json_schema={"type": "object"}, max_output_tokens=2048),
    )
    sent = client.chat.completions.seen
    assert sent["model"] == "my-model"  # the registry sentinel "custom" is translated
    assert sent["max_tokens"] == 2048
    assert sent["response_format"] == {"type": "json_object"}
    assert resp.provider == Provider.custom
    assert resp.parsed == {"ok": True}


def test_custom_errors_clearly_when_unconfigured(monkeypatch):
    monkeypatch.delenv("LDCN_CUSTOM_BASE_URL", raising=False)
    monkeypatch.delenv("LDCN_CUSTOM_MODEL", raising=False)
    from app.core.config import get_settings

    get_settings.cache_clear()
    with pytest.raises(LLMError) as exc:
        CustomOpenAIAdapter().complete("custom", LLMRequest(system="s", user="u"))
    assert "LDCN_CUSTOM" in str(exc.value)  # points at the env var to set
    get_settings.cache_clear()


def test_custom_falls_back_to_placeholder_key_when_none(monkeypatch):
    # A keyless local server (LM Studio/vLLM) must still work without any key.
    monkeypatch.delenv("LDCN_CUSTOM_API_KEY", raising=False)
    client = _FakeClient()
    adapter = CustomOpenAIAdapter(client=client, base_url="http://localhost:8000/v1", model="m")
    resp = adapter.complete("custom", LLMRequest(system="s", user="u"))
    assert resp.provider == Provider.custom  # no key required


def test_router_dispatches_custom():
    captured = {}

    class _Stub:
        def complete(self, model, req, *, api_key=None):
            captured["api_key"] = api_key
            return LLMResponse(provider=Provider.custom, model=model, text="custom-ok")

    out = LLMRouter(adapters={"custom": _Stub()}).route(
        LLMRequest(system="s", user="u"), user_choice="custom", api_key="sk-user"
    )
    assert out.text == "custom-ok"
    assert captured["api_key"] == "sk-user"
