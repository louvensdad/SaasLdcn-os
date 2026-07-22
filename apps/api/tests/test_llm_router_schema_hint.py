from __future__ import annotations

from app.engines.llm.base import LLMAdapter
from app.engines.llm.router import LLMRouter, _render_schema_hint
from app.schemas.llm import LLMRequest, LLMResponse, Provider
from app.schemas.orchestrator import ProjectSpec

# Only Anthropic/OpenAI/Google adapters actually forward req.json_schema to the
# generic "valid JSON" mode. Confirmed live (2026-07-08): a 7-project audit on
# DeepSeek left ProjectSpec.entities empty in every single generation, while
# sibling fields (business_rules/core_workflows) were populated for the same
# requests -- because nothing ever told the model the exact key name to use.
# The router now always embeds the schema's top-level keys as plain text.


class _RecordingAdapter(LLMAdapter):
    def __init__(self) -> None:
        self.received: LLMRequest | None = None

    def complete(self, model: str, req: LLMRequest, *, api_key: str | None = None) -> LLMResponse:
        self.received = req
        return LLMResponse(provider=Provider.deepseek, model=model, text="{}")


def test_render_schema_hint_lists_top_level_keys_in_english():
    hint = _render_schema_hint(ProjectSpec.model_json_schema())
    assert "entities: array de string" in hint
    assert "business_rules: array de string" in hint
    assert "raw_intent: string" in hint
    assert "json_output_keys" in hint


def test_render_schema_hint_empty_for_schema_without_properties():
    assert _render_schema_hint({}) == ""
    assert _render_schema_hint({"properties": {}}) == ""


def test_router_embeds_schema_hint_in_system_prompt_when_json_schema_set():
    adapter = _RecordingAdapter()
    router = LLMRouter(adapters={"deepseek": adapter})
    original_system = "You are the Orchestrator."
    router.route(
        LLMRequest(system=original_system, user="idea", json_schema=ProjectSpec.model_json_schema()),
        user_choice="deepseek-v4-flash",
        api_key="sk-test-key",
    )
    assert adapter.received is not None
    assert adapter.received.system.startswith(original_system)
    assert "entities: array de string" in adapter.received.system


def test_router_does_not_alter_system_prompt_without_json_schema():
    adapter = _RecordingAdapter()
    router = LLMRouter(adapters={"deepseek": adapter})
    original_system = "You are the Orchestrator."
    router.route(
        LLMRequest(system=original_system, user="idea"),
        user_choice="deepseek-v4-flash",
        api_key="sk-test-key",
    )
    assert adapter.received is not None
    assert adapter.received.system == original_system
