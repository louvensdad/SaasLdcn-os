from __future__ import annotations

import json

from app.engines.llm.base import LLMAdapter, LLMError
from app.schemas.llm import LLMRequest, LLMResponse, Provider


class GoogleAdapter(LLMAdapter):
    """Gemini adapter using the official `google-genai` SDK (lazy import).

    Translation contract:
    - system goes as `system_instruction` (separate field, not a message).
    - creativity -> `temperature` in the generation config.
    - JSON via `response_mime_type=application/json` + `response_schema`.
    - `max_output_tokens` for the output cap.
    """

    def __init__(self, client=None):
        self._client = client

    def _import_sdk(self):
        try:
            from google import genai  # lazy: optional dependency
        except ImportError as exc:  # pragma: no cover - environment dependent
            raise LLMError(
                "The 'google-genai' package is required for GoogleAdapter. "
                "Install it (pip install google-genai) and set GOOGLE_API_KEY."
            ) from exc
        return genai

    def _get_client(self, api_key: str | None = None):
        if api_key:
            # User-owned key: ephemeral client, never cached on the shared adapter.
            return self._import_sdk().Client(api_key=api_key)
        if self._client is not None:
            return self._client
        self._client = self._import_sdk().Client()
        return self._client

    def _build_config(self, req: LLMRequest) -> dict:
        config: dict = {
            "system_instruction": req.system,
            "temperature": req.creativity,
            "max_output_tokens": req.max_output_tokens,
        }
        if req.json_schema:
            config["response_mime_type"] = "application/json"
            config["response_schema"] = req.json_schema
        return config

    def complete(self, model: str, req: LLMRequest, *, api_key: str | None = None) -> LLMResponse:
        client = self._get_client(api_key)
        try:
            from google.genai import types  # lazy
        except ImportError as exc:  # pragma: no cover - environment dependent
            raise LLMError("The 'google-genai' package is required for GoogleAdapter.") from exc

        config = types.GenerateContentConfig(**self._build_config(req))
        try:
            resp = client.models.generate_content(model=model, contents=req.user, config=config)
        except Exception as exc:
            raise LLMError(f"Google request failed for {model}: {exc}") from exc

        text = getattr(resp, "text", "") or ""
        parsed = None
        if req.json_schema and text:
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError as exc:
                raise LLMError(f"Model returned non-JSON for a json_schema request: {exc}") from exc

        usage_dict = {}
        usage = getattr(resp, "usage_metadata", None)
        if usage is not None:
            usage_dict = {
                "input": getattr(usage, "prompt_token_count", 0),
                "output": getattr(usage, "candidates_token_count", 0),
            }

        return LLMResponse(
            provider=Provider.google,
            model=model,
            text=text,
            parsed=parsed,
            stopped_by="stop",
            usage=usage_dict,
        )
