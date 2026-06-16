from __future__ import annotations

from app.core.config import get_settings
from app.data.model_registry import MODEL_REGISTRY, resolve_model
from app.engines.llm.anthropic_adapter import AnthropicAdapter
from app.engines.llm.base import LLMAdapter, LLMError
from app.engines.llm.google_adapter import GoogleAdapter
from app.engines.llm.mock_adapter import MockAdapter
from app.engines.llm.openai_adapter import OpenAIAdapter
from app.schemas.llm import LLMRequest, LLMResponse


class LLMRouter:
    """Selects a model (user choice -> role hint -> default) and dispatches to the
    matching provider adapter. Each provider receives its own parameter shape;
    there is no shared parameter blob (diagnosis error #2).

    Graceful degrade (Prompt Mestre requirement #1): when the chosen provider is
    unavailable (no adapter / missing SDK / missing API key / missing capability),
    the router falls back to the deterministic MockAdapter instead of failing — but
    only when ``settings.mock_fallback_enabled``. The fallback is always signalled
    on the response (``served_by_fallback=True``), never disguised as a real run.
    """

    def __init__(
        self,
        adapters: dict[str, LLMAdapter] | None = None,
        *,
        mock_adapter: LLMAdapter | None = None,
    ):
        # Adapters are cheap to construct (SDK import is lazy), so default wiring
        # is safe even without the provider packages installed.
        self._adapters: dict[str, LLMAdapter] = adapters or {
            "anthropic": AnthropicAdapter(),
            "openai": OpenAIAdapter(),
            "google": GoogleAdapter(),
        }
        self._mock: LLMAdapter = mock_adapter or MockAdapter()

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
        settings = get_settings()

        if settings.force_mock:
            return self._mock.complete(model, req)

        adapter = self._adapters.get(provider)
        if adapter is None:
            if settings.mock_fallback_enabled:
                return self._mock.complete(model, req)
            raise LLMError(
                f"No adapter registered for provider '{provider}' (model {model})."
            )

        try:
            return adapter.complete(model, req)
        except LLMError:
            if settings.mock_fallback_enabled:
                return self._mock.complete(model, req)
            raise
