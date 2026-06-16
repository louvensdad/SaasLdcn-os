from __future__ import annotations

from app.data.model_registry import MODEL_REGISTRY, resolve_model
from app.engines.llm.anthropic_adapter import AnthropicAdapter
from app.engines.llm.base import LLMAdapter, LLMError
from app.engines.llm.google_adapter import GoogleAdapter
from app.engines.llm.openai_adapter import OpenAIAdapter
from app.schemas.llm import LLMRequest, LLMResponse


class LLMRouter:
    """Selects a model (user choice -> role hint -> default) and dispatches to the
    matching provider adapter. Each provider receives its own parameter shape;
    there is no shared parameter blob (diagnosis error #2).
    """

    def __init__(self, adapters: dict[str, LLMAdapter] | None = None):
        # Adapters are cheap to construct (SDK import is lazy), so default wiring
        # is safe even without the anthropic package installed.
        self._adapters: dict[str, LLMAdapter] = adapters or {
            "anthropic": AnthropicAdapter(),
            "openai": OpenAIAdapter(),
            "google": GoogleAdapter(),
        }

    def route(
        self,
        req: LLMRequest,
        *,
        user_choice: str | None = None,
        agent_role: str | None = None,
    ) -> LLMResponse:
        model = resolve_model(user_choice=user_choice, agent_role=agent_role)
        meta = MODEL_REGISTRY[model]
        provider = meta["provider"]

        adapter = self._adapters.get(provider)
        if adapter is None:
            raise LLMError(
                f"No adapter registered for provider '{provider}' (model {model})."
            )

        return adapter.complete(model, req)
