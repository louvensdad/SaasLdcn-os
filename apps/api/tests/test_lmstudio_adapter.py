from __future__ import annotations

import pytest

from app.engines.llm.base import LLMError
from app.engines.llm.lmstudio_adapter import LMStudioAdapter
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
    prompt_tokens = 6
    completion_tokens = 2


class _Resp:
    def __init__(self, content: str, model: str):
        self.choices = [_Choice(content)]
        self.model = model
        self.usage = _Usage()


class _Completions:
    def __init__(self, content: str, model: str, boom: bool = False):
        self._content = content
        self._model = model
        self._boom = boom
        self.seen: dict | None = None

    def create(self, **kwargs):
        self.seen = kwargs
        if self._boom:
            raise RuntimeError("connection refused")
        return _Resp(self._content, self._model)


class _FakeClient:
    def __init__(self, content: str = "ok", model: str = "local-model", boom: bool = False):
        self.chat = type("Chat", (), {"completions": _Completions(content, model, boom)})()


def test_lmstudio_builds_classic_openai_params_and_parses():
    client = _FakeClient(content='{"ok": true}')
    adapter = LMStudioAdapter(client=client)
    resp = adapter.complete(
        "local-model",
        LLMRequest(system="sys", user="usr", json_schema={"type": "object"}, max_output_tokens=1024, creativity=0.4),
    )
    sent = client.chat.completions.seen
    assert sent["max_tokens"] == 1024
    assert sent["temperature"] == 0.4
    assert sent["response_format"] == {"type": "json_object"}
    assert resp.provider == Provider.lmstudio
    assert resp.parsed == {"ok": True}
    assert resp.usage == {"input": 6, "output": 2}


def test_lmstudio_api_key_is_ignored_no_network():
    client = _FakeClient()
    adapter = LMStudioAdapter(client=client)
    resp = adapter.complete("local-model", LLMRequest(system="s", user="u"), api_key="should-be-ignored")
    assert resp.provider == Provider.lmstudio


def test_lmstudio_connection_failure_raises_llm_error_with_hint():
    adapter = LMStudioAdapter(client=_FakeClient(boom=True))
    with pytest.raises(LLMError) as exc:
        adapter.complete("local-model", LLMRequest(system="s", user="u"))
    assert "LM Studio" in str(exc.value)


def test_router_dispatches_lmstudio_without_key():
    class _Stub:
        def complete(self, model, req, *, api_key=None):
            return LLMResponse(provider=Provider.lmstudio, model=model, text="local-ok")

    out = LLMRouter(adapters={"lmstudio": _Stub()}).route(
        LLMRequest(system="s", user="u"), user_choice="local-model",
    )
    assert out.text == "local-ok"
