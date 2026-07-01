from __future__ import annotations

import time

from app.core.config import get_settings
from app.data.model_registry import MODEL_REGISTRY, resolve_model
from app.engines.llm.anthropic_adapter import AnthropicAdapter
from app.engines.llm.base import LLMAdapter, LLMError
from app.engines.llm.custom_adapter import CustomOpenAIAdapter
from app.engines.llm.deepseek_adapter import DeepSeekAdapter
from app.engines.llm.google_adapter import GoogleAdapter
from app.engines.llm.mock_adapter import MockAdapter
from app.engines.llm.ollama_adapter import OllamaAdapter
from app.engines.llm.openai_adapter import OpenAIAdapter
from app.engines.llm.openrouter_adapter import OpenRouterAdapter
from app.engines.llm.resilience import (
    DEFAULT_CIRCUIT_BREAKER,
    DEFAULT_RETRY_POLICY,
    CircuitBreaker,
    RetryPolicy,
)
from app.schemas.llm import LLMRequest, LLMResponse


class LLMRouter:
    """Selects a model (user choice -> role hint -> default) and dispatches to the
    matching provider adapter. Each provider receives its own parameter shape;
    there is no shared parameter blob (diagnosis error #2).

    Resilience (diagnosis M1): real-provider calls go through a retry policy
    (exponential backoff + jitter, transient failures only) and a per-provider
    circuit breaker (fast-fail once a provider is repeatedly failing). The breaker
    is shared across router instances because the factory builds a fresh router per
    call.

    Graceful degrade (Prompt Mestre requirement #1): when the chosen provider is
    unavailable (no adapter / missing SDK / missing API key / missing capability),
    the router falls back to the deterministic MockAdapter instead of failing â€” but
    only when ``settings.mock_fallback_enabled``. The fallback is always signalled
    on the response (``served_by_fallback=True``), never disguised as a real run.
    """

    def __init__(
        self,
        adapters: dict[str, LLMAdapter] | None = None,
        *,
        mock_adapter: LLMAdapter | None = None,
        retry_policy: RetryPolicy | None = None,
        circuit_breaker: CircuitBreaker | None = None,
    ):
        # Adapters are cheap to construct (SDK import is lazy), so default wiring
        # is safe even without the provider packages installed.
        self._adapters: dict[str, LLMAdapter] = adapters or {
            "anthropic": AnthropicAdapter(),
            "openai": OpenAIAdapter(),
            "google": GoogleAdapter(),
            "ollama": OllamaAdapter(),
            "openrouter": OpenRouterAdapter(),
            "deepseek": DeepSeekAdapter(),
            "custom": CustomOpenAIAdapter(),
        }
        self._mock: LLMAdapter = mock_adapter or MockAdapter()
        self._retry = retry_policy or DEFAULT_RETRY_POLICY
        self._breaker = circuit_breaker or DEFAULT_CIRCUIT_BREAKER

    def route(
        self,
        req: LLMRequest,
        *,
        user_choice: str | None = None,
        agent_role: str | None = None,
        api_key: str | None = None,
    ) -> LLMResponse:
        routed_model = getattr(api_key, "model", None)
        model = resolve_model(user_choice=routed_model or user_choice, agent_role=agent_role)
        meta = MODEL_REGISTRY[model]
        provider = meta["provider"]
        settings = get_settings()

        # A user-owned key forces a real run with that key: never silently mock,
        # so the user learns if their own key is invalid / out of credit.
        if api_key:
            adapter = self._adapters.get(provider)
            if adapter is None:
                raise LLMError(f"No adapter registered for provider '{provider}' (model {model}).")
            return self._complete_resilient(adapter, provider, model, req, api_key=api_key)

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
            return self._complete_resilient(adapter, provider, model, req, api_key=None)
        except LLMError:
            if settings.mock_fallback_enabled:
                return self._mock.complete(model, req)
            raise

    def _complete_resilient(
        self,
        adapter: LLMAdapter,
        provider: str,
        model: str,
        req: LLMRequest,
        *,
        api_key: str | None,
    ) -> LLMResponse:
        """Invoke the adapter with circuit-breaker gating and transient-aware retry.

        Permanent failures (transient=False) propagate on the first attempt; only
        transient failures (timeout / connection / 429 / 5xx) are retried and count
        toward opening the breaker. The no-key call keeps the original positional
        signature so adapters/stubs that don't accept ``api_key`` still work.
        """
        self._breaker.before(provider)  # may raise CircuitOpenError (transient LLMError)
        attempt = 0
        while True:
            attempt += 1
            try:
                if api_key is None:
                    response = adapter.complete(model, req)
                else:
                    response = adapter.complete(model, req, api_key=api_key)
            except LLMError as exc:
                if not exc.transient:
                    raise
                self._breaker.on_transient_failure(provider)
                if attempt >= self._retry.max_attempts:
                    raise
                time.sleep(self._retry.backoff(attempt))
                continue
            self._breaker.on_success(provider)
            return response
