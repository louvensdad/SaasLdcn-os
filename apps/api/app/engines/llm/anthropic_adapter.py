from __future__ import annotations

import json

from app.engines.llm.base import LLMAdapter, LLMError
from app.schemas.llm import LLMRequest, LLMResponse, Provider

# Effort maps 1:1 to the neutral reasoning level (Claude output_config.effort).
_EFFORT = {"low": "low", "medium": "medium", "high": "high", "max": "max"}

_FABLE_FALLBACK_BETA = "server-side-fallback-2026-06-01"


class AnthropicAdapter(LLMAdapter):
    """Claude adapter using the official `anthropic` SDK.

    The SDK import is lazy so the rest of the app (and the test suite) imports
    cleanly even when `anthropic` is not installed. Correctness notes:
    - NEVER send temperature/top_p/top_k: they 400 on Opus 4.8 / Fable 5.
    - Reasoning via thinking={"type":"adaptive"} + output_config.effort.
    - Structured output via output_config.format (json_schema).
    - Stable `system` carries cache_control for the multi-agent cached prefix.
    - Fable 5: opt into refusal fallbacks; check stop_reason before reading content.
    """

    def __init__(self, client=None):
        self._client = client

    def _get_client(self):
        if self._client is not None:
            return self._client
        try:
            import anthropic  # lazy: optional dependency
        except ImportError as exc:  # pragma: no cover - environment dependent
            raise LLMError(
                "The 'anthropic' package is required for AnthropicAdapter. "
                "Install it (pip install anthropic) and set ANTHROPIC_API_KEY."
            ) from exc
        self._client = anthropic.Anthropic()
        return self._client

    def _wrap_xml(self, req: LLMRequest) -> str:
        return (
            f"<task>\n{req.user}\n</task>\n\n"
            "<output_rules>\n"
            "Siga o contrato de formato definido no sistema. "
            "Nao inclua preambulo fora do formato pedido.\n"
            "</output_rules>"
        )

    def _build_params(self, model: str, req: LLMRequest) -> dict:
        system_block: dict = {"type": "text", "text": req.system}
        if req.cache_prefix:
            system_block["cache_control"] = {"type": "ephemeral"}

        output_config: dict = {"effort": _EFFORT[req.reasoning.value]}
        if req.json_schema:
            output_config["format"] = {"type": "json_schema", "schema": req.json_schema}

        return {
            "model": model,
            "max_tokens": req.max_output_tokens,
            "thinking": {"type": "adaptive"},  # adaptive only; budget_tokens 400s
            "output_config": output_config,
            "system": [system_block],
            "messages": [{"role": "user", "content": self._wrap_xml(req)}],
        }

    def complete(self, model: str, req: LLMRequest) -> LLMResponse:
        client = self._get_client()
        params = self._build_params(model, req)

        use_beta = model == "claude-fable-5"
        if use_beta:
            params["betas"] = [_FABLE_FALLBACK_BETA]
            params["fallbacks"] = [{"model": "claude-opus-4-8"}]
            create = client.beta.messages.create
        else:
            create = client.messages.create

        try:
            resp = create(**params)
        except Exception as exc:  # surface, do not swallow
            raise LLMError(f"Anthropic request failed for {model}: {exc}") from exc

        # Check stop_reason BEFORE reading content — a refusal has empty content.
        stop_reason = getattr(resp, "stop_reason", "") or ""
        text = ""
        if stop_reason != "refusal":
            text = next(
                (b.text for b in resp.content if getattr(b, "type", "") == "text"),
                "",
            )

        parsed = None
        if req.json_schema and text:
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError as exc:
                raise LLMError(f"Model returned non-JSON for a json_schema request: {exc}") from exc

        usage = getattr(resp, "usage", None)
        usage_dict = {}
        if usage is not None:
            usage_dict = {
                "input": getattr(usage, "input_tokens", 0),
                "output": getattr(usage, "output_tokens", 0),
                "cache_read": getattr(usage, "cache_read_input_tokens", 0),
                "cache_write": getattr(usage, "cache_creation_input_tokens", 0),
            }

        return LLMResponse(
            provider=Provider.anthropic,
            model=getattr(resp, "model", model),
            text=text,
            parsed=parsed,
            stopped_by=stop_reason,
            usage=usage_dict,
            served_by_fallback=(stop_reason != "refusal" and use_beta),
        )
