from __future__ import annotations

import json

from app.core.config import get_settings
from app.engines.llm.base import (
    LLMAdapter,
    LLMError,
    is_transient_provider_error,
    timeout_seconds,
)
from app.schemas.llm import LLMRequest, LLMResponse, Provider


class LMStudioAdapter(LLMAdapter):
    """Local, key-free generation via LM Studio's OpenAI-compatible endpoint.

    Same "no API key" shape as OllamaAdapter: LM Studio serves
    `/v1/chat/completions` locally (default ``http://localhost:1234/v1``), so
    we reuse the `openai` SDK pointed there with a placeholder key. Unlike
    Ollama's pull-by-name convention, LM Studio's model id is whatever the
    user currently has loaded in the app -- there is no meaningful default,
    the caller must supply the exact model id LM Studio reports.
    """

    def __init__(self, client=None, base_url: str | None = None):
        self._client = client
        self._base_url = base_url

    def _import_sdk(self):
        try:
            import openai  # lazy: the SDK is reused to speak LM Studio's OpenAI API
        except ImportError as exc:  # pragma: no cover - environment dependent
            raise LLMError(
                "The 'openai' package is required for LMStudioAdapter (it speaks the "
                "OpenAI-compatible API). Install it with: pip install openai."
            ) from exc
        return openai

    def _get_client(self):
        if self._client is not None:
            return self._client
        base_url = self._base_url or get_settings().lmstudio_base_url
        self._client = self._import_sdk().OpenAI(base_url=base_url, api_key="lm-studio")
        return self._client

    def _build_params(self, model: str, req: LLMRequest) -> dict:
        params: dict = {
            "model": model,
            "messages": [
                {"role": "system", "content": req.system},
                {"role": "user", "content": req.user},
            ],
            "max_tokens": req.max_output_tokens,
            "temperature": req.creativity,
            # Per-request hard timeout (seconds) -- bound a slow/hung local run (H1/H2).
            "timeout": timeout_seconds(req),
        }
        if req.json_schema:
            params["response_format"] = {"type": "json_object"}
        return params

    def complete(self, model: str, req: LLMRequest, *, api_key: str | None = None) -> LLMResponse:
        # api_key is intentionally ignored -- a local LM Studio run is key-free.
        client = self._get_client()
        params = self._build_params(model, req)
        try:
            resp = client.chat.completions.create(**params)
        except Exception as exc:
            raise LLMError(
                f"LM Studio request failed for model '{model}'. Is the LM Studio local "
                f"server running with a model loaded? Details: {exc}",
                transient=is_transient_provider_error(exc),
            ) from exc

        choice = resp.choices[0]
        text = getattr(choice.message, "content", "") or ""
        parsed = None
        if req.json_schema and text:
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError as exc:
                raise LLMError(f"LM Studio model returned non-JSON for a json_schema request: {exc}") from exc

        usage = getattr(resp, "usage", None)
        usage_dict = {}
        if usage is not None:
            usage_dict = {
                "input": getattr(usage, "prompt_tokens", 0),
                "output": getattr(usage, "completion_tokens", 0),
            }

        return LLMResponse(
            provider=Provider.lmstudio,
            model=getattr(resp, "model", model) or model,
            text=text,
            parsed=parsed,
            stopped_by=getattr(choice, "finish_reason", "") or "",
            usage=usage_dict,
        )
