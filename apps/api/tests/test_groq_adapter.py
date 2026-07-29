from __future__ import annotations

import pytest

from app.engines.llm.base import LLMError
from app.engines.llm.groq_adapter import GroqAdapter
from app.engines.llm.router import LLMRouter
from app.schemas.llm import LLMRequest, LLMResponse, Provider


class _Msg:
    def __init__(self, content: str):
        self.content = content


class _Choice:
    def __init__(self, content: str):
        self.message = _Msg(content)
        self.finish_reason = "stop"


class _Usage:
    prompt_tokens = 9
    completion_tokens = 4


class _Resp:
    def __init__(self, content: str, model: str):
        self.choices = [_Choice(content)]
        self.model = model
        self.usage = _Usage()


class _Completions:
    def __init__(self, content: str, model: str):
        self._content = content
        self._model = model
        self.seen: dict | None = None

    def create(self, **kwargs):
        self.seen = kwargs
        return _Resp(self._content, self._model)


class _FakeClient:
    def __init__(self, content: str = "ok", model: str = "llama-3.3-70b-versatile"):
        self.chat = type("Chat", (), {"completions": _Completions(content, model)})()


def test_groq_builds_classic_openai_params_and_parses():
    client = _FakeClient(content='{"ok": true}')
    adapter = GroqAdapter(client=client)
    resp = adapter.complete(
        "llama-3.3-70b-versatile",
        LLMRequest(system="sys", user="usr", json_schema={"type": "object"}, max_output_tokens=2048, creativity=0.2),
        api_key="gsk-test-key",
    )
    sent = client.chat.completions.seen
    assert sent["max_tokens"] == 2048
    assert sent["temperature"] == 0.2
    assert sent["response_format"] == {"type": "json_object"}
    assert [m["role"] for m in sent["messages"]] == ["system", "user"]
    assert resp.provider == Provider.groq
    assert resp.parsed == {"ok": True}
    assert resp.usage == {"input": 9, "output": 4}


def test_groq_requires_a_real_key_no_placeholder_fallback():
    adapter = GroqAdapter(client=_FakeClient())
    with pytest.raises(LLMError) as exc:
        adapter.complete("llama-3.3-70b-versatile", LLMRequest(system="s", user="u"))
    assert "Inteligência Artificial" in str(exc.value)


def test_router_dispatches_groq_with_user_key():
    captured = {}

    class _Stub:
        def complete(self, model, req, *, api_key=None):
            captured["api_key"] = api_key
            return LLMResponse(provider=Provider.groq, model=model, text="groq-ok")

    out = LLMRouter(adapters={"groq": _Stub()}).route(
        LLMRequest(system="s", user="u"), user_choice="llama-3.3-70b-versatile", api_key="gsk-user",
    )
    assert out.text == "groq-ok"
    assert captured["api_key"] == "gsk-user"
