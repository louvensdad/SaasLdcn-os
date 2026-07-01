from __future__ import annotations

import pytest

from app.engines.llm.base import LLMError
from app.engines.llm.openrouter_adapter import OpenRouterAdapter
from app.engines.llm.router import LLMRouter
from app.engines.orchestrator_engine import _validate_spec
from app.schemas.llm import LLMRequest, LLMResponse, Provider


# --- OpenRouter adapter (no network) --------------------------------------

class _Msg:
    def __init__(self, content):
        self.content = content


class _Choice:
    def __init__(self, content):
        self.message = _Msg(content)
        self.finish_reason = "stop"


class _Usage:
    prompt_tokens = 9
    completion_tokens = 4


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
    def __init__(self, content="hi", model="deepseek/deepseek-chat"):
        self.chat = type("Chat", (), {"completions": _Completions(content, model)})()


def test_openrouter_builds_openai_style_params_and_parses_json():
    client = _FakeClient(content='{"ok": true}')
    adapter = OpenRouterAdapter(client=client)
    resp = adapter.complete(
        "deepseek/deepseek-chat",
        LLMRequest(system="s", user="u", json_schema={"type": "object"}, max_output_tokens=2048),
    )
    sent = client.chat.completions.seen
    assert sent["max_tokens"] == 2048
    assert sent["response_format"] == {"type": "json_object"}
    assert resp.provider == Provider.openrouter
    assert resp.parsed == {"ok": True}


def test_openrouter_without_any_key_raises_actionable_error():
    # No injected client, no api_key, no OPENROUTER_API_KEY env -> clear error.
    adapter = OpenRouterAdapter()
    with pytest.raises(LLMError) as exc:
        adapter.complete("deepseek/deepseek-chat", LLMRequest(system="s", user="u"))
    assert "OpenRouter key" in str(exc.value)


def test_router_dispatches_openrouter_with_user_key():
    captured = {}

    class _Stub:
        def complete(self, model, req, *, api_key=None):
            captured["api_key"] = api_key
            return LLMResponse(provider=Provider.openrouter, model=model, text="ok")

    router = LLMRouter(adapters={"openrouter": _Stub()})
    out = router.route(LLMRequest(system="s", user="u"), user_choice="deepseek/deepseek-r1:free", api_key="sk-or-xyz")
    assert out.text == "ok"
    assert captured["api_key"] == "sk-or-xyz"  # user key forwarded to the adapter


# --- orchestrator spec coercion (the 7-error bug) -------------------------

def test_spec_coercion_handles_object_rules_and_missing_raw_intent():
    drifted = {
        # raw_intent missing entirely (weak models drop it)
        "product_summary": "Help Desk SaaS",
        "business_rules": [
            {"rule": "Cliente só vê seus chamados", "reason": "Privacidade"},
            {"rule": "Apenas ADMIN exclui chamado", "reason": "Segurança"},
        ],
        "target_users": [{"name": "ADMIN"}, "CLIENTE"],
        "entities": [{"entity": "Chamado"}],
        "core_workflows": ["Login", {"workflow": "Abrir chamado"}],
        "non_functional": [{"key": "seg", "value": "JWT"}],
        "suggested_stack": "Java + Spring",  # wrong type -> defaulted
        "confidence": 1.0,
    }
    spec = _validate_spec(drifted, "app de help desk")
    assert spec.raw_intent == "app de help desk"  # filled from the original intent
    assert spec.business_rules == ["Cliente só vê seus chamados", "Apenas ADMIN exclui chamado"]
    assert spec.target_users == ["ADMIN", "CLIENTE"]
    assert spec.entities == ["Chamado"]
    assert spec.core_workflows == ["Login", "Abrir chamado"]
    assert spec.suggested_stack.language == ""  # invalid stack fell back to default
    assert spec.confidence == 1.0


def test_spec_coercion_keeps_already_valid_payload():
    valid = {
        "raw_intent": "x",
        "business_rules": ["a", "b"],
        "target_users": ["u"],
        "entities": ["E"],
        "core_workflows": ["w"],
        "non_functional": {"sec": "auth"},
        "confidence": 0.9,
    }
    spec = _validate_spec(valid, "fallback")
    assert spec.raw_intent == "x" and spec.business_rules == ["a", "b"]
    assert spec.non_functional == {"sec": "auth"}
