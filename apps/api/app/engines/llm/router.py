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
from app.engines.llm.response_cache import llm_response_cache
from app.schemas.llm import LLMRequest, LLMResponse


def _describe_schema_type(prop: dict, required_hint: bool = True) -> str:
    if "$ref" in prop:
        return "objeto"
    prop_type = prop.get("type")
    if prop_type == "array":
        items = prop.get("items") or {}
        item_type = "objeto" if "$ref" in items else (items.get("type") or "string")
        return f"array de {item_type}"
    if prop_type == "object":
        return "objeto"
    if prop_type is None and isinstance(prop.get("anyOf"), list):
        types = sorted({opt.get("type") for opt in prop["anyOf"] if isinstance(opt, dict) and opt.get("type")})
        return " ou ".join(types) if types else "string"
    return {"string": "string", "integer": "number", "number": "number", "boolean": "boolean"}.get(prop_type, "string")


def _render_schema_hint(schema: dict) -> str:
    """Render the schema's top-level keys as plain, unmissable prompt text.

    Only Anthropic/OpenAI/Google adapters actually forward req.json_schema to the
    provider as an enforced structured-output contract; DeepSeek/OpenRouter/Ollama/
    the custom OpenAI-compatible adapter only request generic "valid JSON" mode
    (response_format={"type": "json_object"}) because those providers don't
    reliably support strict schema enforcement. Without this, a model on one of
    those four adapters has no explicit signal for the exact key names to emit —
    confirmed live (2026-07-08): a 7-project audit on DeepSeek left
    ProjectSpec.entities empty in every single generation, even though sibling
    fields like business_rules/core_workflows were populated for the same
    requests. Embedding the key list as text costs a few tokens and fixes the
    weak-schema-provider path without weakening the strict-schema ones."""
    properties = schema.get("properties") or {}
    if not isinstance(properties, dict) or not properties:
        return ""
    required = set(schema.get("required") or [])
    lines = [
        f"- {name}: {_describe_schema_type(prop)}" + ("" if name in required else " (opcional)")
        for name, prop in properties.items()
        if isinstance(prop, dict)
    ]
    if not lines:
        return ""
    return (
        "\n\n<json_output_keys>\n"
        "Sua resposta JSON DEVE usar EXATAMENTE estas chaves de nivel superior "
        "(nomes em ingles, exatamente como abaixo -- nunca traduza nem renomeie):\n"
        + "\n".join(lines)
        + "\n</json_output_keys>"
    )


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
    the router falls back to the deterministic MockAdapter instead of failing — but
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
        allow_cache: bool = False,
        cache_namespace: str = "shared-platform",
    ) -> LLMResponse:
        """`allow_cache` is opt-in and False everywhere by default: several
        callers (factory_pipeline.iter_single_agent's smart retry on an empty/
        malformed reply, most notably) deliberately resend an IDENTICAL
        request expecting a genuinely fresh provider call -- non-deterministic
        sampling is the whole point of the retry there, and a cache hit would
        silently defeat it. Only set True at call sites where a duplicate
        request really does mean "already answered, skip it" (e.g. the repair
        loops in verification_engine.py / llm_repair_engine.py)."""
        routed_model = getattr(api_key, "model", None)
        model = resolve_model(user_choice=routed_model or user_choice, agent_role=agent_role)
        meta = MODEL_REGISTRY[model]
        provider = meta["provider"]
        settings = get_settings()

        if req.json_schema:
            hint = _render_schema_hint(req.json_schema)
            if hint:
                req = req.model_copy(update={"system": req.system + hint})

        # A user-owned key forces a real run with that key: never silently mock,
        # so the user learns if their own key is invalid / out of credit.
        if api_key:
            adapter = self._adapters.get(provider)
            if adapter is None:
                raise LLMError(f"No adapter registered for provider '{provider}' (model {model}).")
            return self._complete_resilient(adapter, provider, model, req, api_key=api_key)

        if settings.force_mock:
            return self._mock.complete(model, req)

        # Token Intelligence: consult the app-level response cache before any
        # provider call (opt-in, see docstring above).
        cache_key = (
            llm_response_cache.make_key(model, req, namespace=cache_namespace)
            if allow_cache
            else None
        )
        if cache_key is not None:
            cached = llm_response_cache.get(cache_key)
            if cached is not None:
                return cached.model_copy(update={"served_by_cache": True})

        adapter = self._adapters.get(provider)
        if adapter is None:
            if settings.mock_fallback_enabled:
                return self._mock.complete(model, req)
            raise LLMError(
                f"No adapter registered for provider '{provider}' (model {model})."
            )

        try:
            response = self._complete_resilient(adapter, provider, model, req, api_key=None)
        except LLMError:
            if settings.mock_fallback_enabled:
                return self._mock.complete(model, req)
            raise
        if cache_key is not None:
            llm_response_cache.set(cache_key, response)
        return response

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
