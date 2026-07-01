from __future__ import annotations

import json

from app.data.model_registry import MODEL_REGISTRY
from app.engines.llm.base import (
    LLMAdapter,
    LLMError,
    is_transient_provider_error,
    timeout_seconds,
)
from app.schemas.llm import LLMRequest, LLMResponse, Provider


class OpenAIAdapter(LLMAdapter):
    """GPT adapter using the official `openai` SDK (lazy import).

    Translation contract (contrast with the Claude adapter):
    - system goes as a `system` message in `messages[]` (strict role split).
    - creativity -> `temperature` for chat models that accept it; reasoning
      (o-series) models reject temperature, so for those we send
      `reasoning_effort` instead and omit temperature.
    - JSON via `response_format` json_schema (strict).
    - `max_completion_tokens` (the newer param; works for chat + reasoning models).
    """

    def __init__(self, client=None):
        self._client = client

    def _import_sdk(self):
        try:
            import openai  # lazy: optional dependency
        except ImportError as exc:  # pragma: no cover - environment dependent
            raise LLMError(
                "The 'openai' package is required for OpenAIAdapter. "
                "Install it (pip install openai) and set OPENAI_API_KEY."
            ) from exc
        return openai

    def _get_client(self, api_key: str | None = None):
        if api_key:
            # User-owned key: ephemeral client, never cached on the shared adapter.
            return self._import_sdk().OpenAI(api_key=api_key)
        if self._client is not None:
            return self._client
        self._client = self._import_sdk().OpenAI()
        return self._client

    def _build_params(self, model: str, req: LLMRequest, *, supports_temperature: bool) -> dict:
        params: dict = {
            "model": model,
            "messages": [
                {"role": "system", "content": req.system},
                {"role": "user", "content": req.user},
            ],
            "max_completion_tokens": req.max_output_tokens,
            # Per-request hard timeout (seconds) — a hung call must fail fast (H1/H2).
            "timeout": timeout_seconds(req),
        }
        if supports_temperature:
            params["temperature"] = req.creativity
        else:
            # reasoning (o-series) models: depth via reasoning_effort, no temperature
            params["reasoning_effort"] = req.reasoning.value
        if req.json_schema:
            params["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "output", "schema": req.json_schema, "strict": True},
            }
        return params

    def complete(self, model: str, req: LLMRequest, *, api_key: str | None = None) -> LLMResponse:
        meta = MODEL_REGISTRY.get(model, {})
        client = self._get_client(api_key)
        params = self._build_params(model, req, supports_temperature=meta.get("supports_temperature", True))

        try:
            resp = client.chat.completions.create(**params)
        except Exception as exc:
            raise LLMError(
                f"OpenAI request failed for {model}: {exc}",
                transient=is_transient_provider_error(exc),
            ) from exc

        choice = resp.choices[0]
        text = getattr(choice.message, "content", "") or ""
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
                "input": getattr(usage, "prompt_tokens", 0),
                "output": getattr(usage, "completion_tokens", 0),
            }

        return LLMResponse(
            provider=Provider.openai,
            model=getattr(resp, "model", model),
            text=text,
            parsed=parsed,
            stopped_by=getattr(choice, "finish_reason", "") or "",
            usage=usage_dict,
        )
