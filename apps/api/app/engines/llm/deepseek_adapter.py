from __future__ import annotations

import json
import os

from app.core.config import get_settings
from app.engines.llm.base import (
    LLMAdapter,
    LLMError,
    normalize_provider_error,
    timeout_seconds,
)
from app.schemas.llm import LLMRequest, LLMResponse, Provider


class DeepSeekAdapter(LLMAdapter):
    """Generation via DeepSeek's first-class API (V4 Flash / V4 Pro).

    DeepSeek speaks the OpenAI Chat Completions API, so we reuse the ``openai`` SDK
    pointed at ``https://api.deepseek.com``. A key is required: the user's own DeepSeek
    key (preferred, via the ephemeral vault) or the server's ``DEEPSEEK_API_KEY`` env
    var as a fallback.
    """

    def __init__(self, client=None, base_url: str | None = None):
        self._client = client
        self._base_url = base_url

    def _import_sdk(self):
        try:
            import openai  # lazy: reused to speak DeepSeek's OpenAI-compatible API
        except ImportError as exc:  # pragma: no cover - environment dependent
            raise LLMError(
                "The 'openai' package is required for DeepSeekAdapter. "
                "Install it with: pip install openai."
            ) from exc
        return openai

    def _get_client(self, api_key: str | None):
        base_url = (self._base_url or get_settings().deepseek_base_url).rstrip("/")
        if api_key:
            # User-owned key: ephemeral client, never cached on the shared adapter.
            return self._import_sdk().OpenAI(base_url=base_url, api_key=api_key)
        if self._client is not None:
            return self._client
        key = os.environ.get("DEEPSEEK_API_KEY")
        if not key:
            raise LLMError(
                "No DeepSeek key available. Add one via 'Use my own key' (provider: "
                "deepseek) or set DEEPSEEK_API_KEY on the server."
            )
        self._client = self._import_sdk().OpenAI(base_url=base_url, api_key=key)
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
            # Per-request hard timeout (seconds) — fail fast on a hung call (H1/H2).
            "timeout": timeout_seconds(req),
        }
        if req.json_schema:
            # DeepSeek supports OpenAI's json_object response_format.
            params["response_format"] = {"type": "json_object"}
        return params

    def complete(self, model: str, req: LLMRequest, *, api_key: str | None = None) -> LLMResponse:
        client = self._get_client(api_key)
        params = self._build_params(model, req)
        try:
            resp = client.chat.completions.create(**params)
        except Exception as exc:
            raise normalize_provider_error("DeepSeek", model, exc) from exc

        choice = resp.choices[0]
        text = getattr(choice.message, "content", "") or ""
        parsed = None
        if req.json_schema and text:
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError as exc:
                raise LLMError(f"DeepSeek model returned non-JSON for a json_schema request: {exc}") from exc

        usage = getattr(resp, "usage", None)
        usage_dict = {}
        if usage is not None:
            usage_dict = {
                "input": getattr(usage, "prompt_tokens", 0),
                "output": getattr(usage, "completion_tokens", 0),
            }

        return LLMResponse(
            provider=Provider.deepseek,
            model=getattr(resp, "model", model) or model,
            text=text,
            parsed=parsed,
            stopped_by=getattr(choice, "finish_reason", "") or "",
            usage=usage_dict,
        )
