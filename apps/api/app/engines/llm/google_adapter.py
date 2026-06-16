from __future__ import annotations

import json

from app.engines.llm.base import LLMAdapter, LLMError
from app.schemas.llm import LLMRequest, LLMResponse, Provider

# JSON Schema keywords the Gemini Developer API does not accept on response_schema.
_GEMINI_DROP_KEYS = {"title", "default", "$schema", "examples", "$defs", "additionalProperties"}


def _to_gemini_schema(schema: dict, defs: dict | None = None) -> dict:
    """Convert a Pydantic JSON Schema into the Gemini Developer API subset.

    - resolves `$ref` against `$defs` (inline);
    - strips unsupported keywords (title/default/$defs/additionalProperties/...);
    - drops free-form map objects (type=object + additionalProperties, no
      properties) that Gemini cannot represent — the field falls back to its
      Pydantic default after parsing.
    """
    if defs is None:
        defs = schema.get("$defs", {})

    if "$ref" in schema:
        ref = schema["$ref"].split("/")[-1]
        return _to_gemini_schema(defs.get(ref, {}), defs)

    out: dict = {}
    for key, value in schema.items():
        if key in _GEMINI_DROP_KEYS:
            continue
        if key == "properties" and isinstance(value, dict):
            props: dict = {}
            for prop_name, prop_schema in value.items():
                if _is_free_map(prop_schema):
                    continue  # Gemini can't express an open string->string map
                props[prop_name] = _to_gemini_schema(prop_schema, defs)
            out["properties"] = props
        elif isinstance(value, dict):
            out[key] = _to_gemini_schema(value, defs)
        elif isinstance(value, list):
            out[key] = [_to_gemini_schema(v, defs) if isinstance(v, dict) else v for v in value]
        else:
            out[key] = value

    # Keep `required` consistent with the (possibly pruned) properties.
    if "required" in out and "properties" in out:
        out["required"] = [r for r in out["required"] if r in out["properties"]]
        if not out["required"]:
            del out["required"]
    return out


def _is_free_map(prop_schema: dict) -> bool:
    return (
        isinstance(prop_schema, dict)
        and prop_schema.get("type") == "object"
        and "additionalProperties" in prop_schema
        and "properties" not in prop_schema
    )


class GoogleAdapter(LLMAdapter):
    """Gemini adapter using the official `google-genai` SDK (lazy import).

    Translation contract:
    - system goes as `system_instruction` (separate field, not a message).
    - creativity -> `temperature` in the generation config.
    - JSON via `response_mime_type=application/json` + a SANITIZED
      `response_schema`. Pydantic's raw JSON Schema carries `$ref`/`$defs`,
      `title`/`default`, and `additionalProperties` (free-form maps), which the
      Gemini *Developer API* (AI Studio) rejects. `_to_gemini_schema` inlines
      refs, strips those keywords, and drops free-map objects so Gemini still
      enforces the correct field names/types. Result is Pydantic-validated too.
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
            config["response_schema"] = _to_gemini_schema(req.json_schema)
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
