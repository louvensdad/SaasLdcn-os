from __future__ import annotations

import json

from app.engines.llm.base import (
    LLMAdapter,
    LLMError,
    normalize_provider_error,
    timeout_seconds,
)
from app.schemas.llm import LLMRequest, LLMResponse, Provider

_GROQ_BASE_URL = "https://api.groq.com/openai/v1"


class GroqAdapter(LLMAdapter):
    """Cloud generation via Groq's OpenAI-compatible endpoint.

    placeholder-key fallback, a real user-owned key is mandatory (BYOK, vault
    56/68). Reuses the `openai` SDK pointed at Groq's fixed base URL, same
    """

    def __init__(self, client=None):
        self._client = client

    def _import_sdk(self):
        try:
            import openai  # lazy: reused to speak Groq's OpenAI-compatible API
        except ImportError as exc:  # pragma: no cover - environment dependent
            raise LLMError(
                "The 'openai' package is required for GroqAdapter (it speaks the "
                "OpenAI-compatible API). Install it with: pip install openai."
            ) from exc
        return openai

    def _get_client(self, api_key: str | None):
        if not api_key:
            raise LLMError("No Groq API key configured. Cadastre uma chave em Configurações → Inteligência Artificial.")
        if self._client is not None:
            return self._client
        self._client = self._import_sdk().OpenAI(base_url=_GROQ_BASE_URL, api_key=api_key)
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
            # Per-request hard timeout (seconds) -- fail fast on a hung call (H1/H2).
            "timeout": timeout_seconds(req),
        }
        if req.json_schema:
            params["response_format"] = {"type": "json_object"}
        return params

    def complete(self, model: str, req: LLMRequest, *, api_key: str | None = None) -> LLMResponse:
        client = self._get_client(api_key)
        params = self._build_params(model, req)
        try:
            resp = client.chat.completions.create(**params)
        except Exception as exc:
            raise normalize_provider_error("Groq", model, exc) from exc

        choice = resp.choices[0]
        text = getattr(choice.message, "content", "") or ""
        parsed = None
        if req.json_schema and text:
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError as exc:
                raise LLMError(f"Groq model returned non-JSON for a json_schema request: {exc}") from exc

        usage = getattr(resp, "usage", None)
        usage_dict = {}
        if usage is not None:
            usage_dict = {
                "input": getattr(usage, "prompt_tokens", 0),
                "output": getattr(usage, "completion_tokens", 0),
            }

        return LLMResponse(
            provider=Provider.groq,
            model=getattr(resp, "model", model) or model,
            text=text,
            parsed=parsed,
            stopped_by=getattr(choice, "finish_reason", "") or "",
            usage=usage_dict,
        )
