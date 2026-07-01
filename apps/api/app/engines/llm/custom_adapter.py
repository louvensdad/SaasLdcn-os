from __future__ import annotations

import json
import os

from app.core.config import get_settings
from app.engines.llm.base import (
    LLMAdapter,
    LLMError,
    is_transient_provider_error,
    timeout_seconds,
)
from app.schemas.llm import LLMRequest, LLMResponse, Provider


class CustomOpenAIAdapter(LLMAdapter):
    """Generation via ANY user-configured OpenAI-compatible endpoint.

    Targets servers that speak the OpenAI Chat Completions API — vLLM, LM Studio,
    Ollama (custom host), Together, Groq, Fireworks, etc. The base URL and the model
    id come from settings (``LDCN_CUSTOM_BASE_URL`` / ``LDCN_CUSTOM_MODEL``). The key
    is optional: the per-user vault (provider ``custom``) wins, else
    ``LDCN_CUSTOM_API_KEY``, else a placeholder (many local servers ignore it).
    """

    def __init__(self, client=None, base_url: str | None = None, model: str | None = None):
        self._client = client
        self._base_url = base_url
        self._model = model

    def _import_sdk(self):
        try:
            import openai  # lazy: reused to speak the OpenAI-compatible API
        except ImportError as exc:  # pragma: no cover - environment dependent
            raise LLMError(
                "The 'openai' package is required for CustomOpenAIAdapter. "
                "Install it with: pip install openai."
            ) from exc
        return openai

    def _resolved_base_url(self) -> str:
        base_url = self._base_url or get_settings().custom_base_url
        if not base_url:
            raise LLMError(
                "No custom endpoint configured. Set LDCN_CUSTOM_BASE_URL (and "
                "LDCN_CUSTOM_MODEL) to point at your OpenAI-compatible server."
            )
        return base_url

    def _resolved_model(self, model: str) -> str:
        # The registry id is the sentinel "custom"; the real model the server
        # expects comes from config (or an explicitly injected override).
        return self._model or get_settings().custom_model or (model if model != "custom" else "")

    def _get_client(self, api_key: str | None):
        base_url = self._resolved_base_url()
        key = api_key or os.environ.get("LDCN_CUSTOM_API_KEY") or "sk-noauth"
        if api_key:
            return self._import_sdk().OpenAI(base_url=base_url, api_key=key)
        if self._client is not None:
            return self._client
        self._client = self._import_sdk().OpenAI(base_url=base_url, api_key=key)
        return self._client

    def _build_params(self, model: str, req: LLMRequest) -> dict:
        resolved = self._resolved_model(model)
        if not resolved:
            raise LLMError("No custom model configured. Set LDCN_CUSTOM_MODEL to the model id your server expects.")
        params: dict = {
            "model": resolved,
            "messages": [
                {"role": "system", "content": req.system},
                {"role": "user", "content": req.user},
            ],
            "max_tokens": req.max_output_tokens,
            "temperature": req.creativity,
            # Per-request hard timeout (seconds) — fail fast on a hung endpoint (H1/H2).
            "timeout": timeout_seconds(req),
        }
        if req.json_schema:
            params["response_format"] = {"type": "json_object"}
        return params

    def complete(self, model: str, req: LLMRequest, *, api_key: str | None = None) -> LLMResponse:
        params = self._build_params(model, req)
        client = self._get_client(api_key)
        try:
            resp = client.chat.completions.create(**params)
        except Exception as exc:
            raise LLMError(
                f"Custom endpoint request failed for model '{params['model']}': {exc}",
                transient=is_transient_provider_error(exc),
            ) from exc

        choice = resp.choices[0]
        text = getattr(choice.message, "content", "") or ""
        parsed = None
        if req.json_schema and text:
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError as exc:
                raise LLMError(f"Custom model returned non-JSON for a json_schema request: {exc}") from exc

        usage = getattr(resp, "usage", None)
        usage_dict = {}
        if usage is not None:
            usage_dict = {
                "input": getattr(usage, "prompt_tokens", 0),
                "output": getattr(usage, "completion_tokens", 0),
            }

        return LLMResponse(
            provider=Provider.custom,
            model=getattr(resp, "model", params["model"]) or params["model"],
            text=text,
            parsed=parsed,
            stopped_by=getattr(choice, "finish_reason", "") or "",
            usage=usage_dict,
        )
