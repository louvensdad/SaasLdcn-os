from __future__ import annotations

import pytest

from app.engines.llm.base import LLMError
from app.engines.llm.ollama_adapter import OllamaAdapter
from app.engines.llm.router import LLMRouter
from app.schemas.llm import LLMRequest, LLMResponse, Provider


# --- fake OpenAI-compatible client (no network) ---------------------------

class _Msg:
    def __init__(self, content: str):
        self.content = content


class _Choice:
    def __init__(self, content: str):
        self.message = _Msg(content)
        self.finish_reason = "stop"


class _Usage:
    prompt_tokens = 11
    completion_tokens = 7


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
    def __init__(self, content: str = "ok", model: str = "qwen2.5-coder:7b", boom: bool = False):
        self.chat = type("Chat", (), {"completions": _Completions(content, model, boom)})()


# --- tests ----------------------------------------------------------------

def test_ollama_builds_classic_openai_params_and_parses():
    client = _FakeClient(content='<<<FILE path="a.txt">>>\nhi\n<<<END>>>')
    adapter = OllamaAdapter(client=client)
    resp = adapter.complete(
        "qwen2.5-coder:7b",
        LLMRequest(system="sys", user="usr", max_output_tokens=4096, creativity=0.3),
    )
    sent = client.chat.completions.seen
    assert sent["max_tokens"] == 4096  # classic param, not max_completion_tokens
    assert sent["temperature"] == 0.3
    assert "max_completion_tokens" not in sent and "reasoning_effort" not in sent
    assert [m["role"] for m in sent["messages"]] == ["system", "user"]
    assert resp.provider == Provider.ollama
    assert resp.text.startswith("<<<FILE")
    assert resp.usage == {"input": 11, "output": 7}


def test_ollama_json_schema_downgrades_to_json_object_and_parses():
    client = _FakeClient(content='{"ok": true}')
    adapter = OllamaAdapter(client=client)
    resp = adapter.complete(
        "qwen2.5-coder:7b",
        LLMRequest(system="sys", user="usr", json_schema={"type": "object"}),
    )
    # Ollama's bridge gets json_object mode (not the strict json_schema form).
    assert client.chat.completions.seen["response_format"] == {"type": "json_object"}
    assert resp.parsed == {"ok": True}


def test_ollama_api_key_is_ignored_no_network():
    # A local run is key-free; passing a key must not change behaviour or leak.
    client = _FakeClient()
    adapter = OllamaAdapter(client=client)
    resp = adapter.complete("qwen2.5-coder:7b", LLMRequest(system="s", user="u"), api_key="should-be-ignored")
    assert resp.provider == Provider.ollama


def test_ollama_connection_failure_raises_llm_error_with_hint():
    adapter = OllamaAdapter(client=_FakeClient(boom=True))
    with pytest.raises(LLMError) as exc:
        adapter.complete("qwen2.5-coder:7b", LLMRequest(system="s", user="u"))
    assert "ollama pull" in str(exc.value)  # actionable hint for the user


def test_router_dispatches_local_model_to_ollama_without_key():
    class _StubOllama:
        def __init__(self):
            self.calls = 0

        def complete(self, model, req, *, api_key=None):
            self.calls += 1
            return LLMResponse(provider=Provider.ollama, model=model, text="local-ok")

    stub = _StubOllama()
    router = LLMRouter(adapters={"ollama": stub})
    out = router.route(LLMRequest(system="s", user="u"), user_choice="deepseek-coder-v2:16b")
    assert out.text == "local-ok" and stub.calls == 1
    assert out.model == "deepseek-coder-v2:16b"
