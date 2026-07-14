from __future__ import annotations

import hashlib
import json
from collections import OrderedDict

from app.schemas.llm import LLMRequest, LLMResponse

# Token Intelligence (Engineering Policy gap #7): an app-level cache of complete
# LLM responses, consulted BEFORE any provider call. Distinct from Anthropic's
# provider-side prompt-PREFIX cache (cache_prefix on LLMRequest / cache_control
# in anthropic_adapter.py) -- that's a cost optimization on the stable system
# prompt that still calls the API every time. This skips the call entirely when
# an IDENTICAL request (same model + same full content) has already been
# answered in this process -- e.g. a repair round or a retried stage resending
# the exact same context. Bounded LRU so a long-running process can't leak
# memory; process-lifetime only (no cross-restart persistence), which is
# honest about its scope -- a real, safe optimization, not a distributed cache.

_MAX_ENTRIES = 256


class LLMResponseCache:
    def __init__(self, max_entries: int = _MAX_ENTRIES) -> None:
        self._max_entries = max_entries
        self._entries: OrderedDict[str, LLMResponse] = OrderedDict()

    @staticmethod
    def make_key(model: str, req: LLMRequest) -> str:
        """Hashes everything that affects the output: model + full request
        content. Two requests differing only in, say, timeout_ms still hash
        differently on purpose -- cheaper to over-invalidate than to risk
        serving a response for a request that wasn't actually identical."""
        schema_key = json.dumps(req.json_schema, sort_keys=True) if req.json_schema else ""
        payload = "\x1f".join([
            model, req.system, req.user, req.reasoning.value, repr(req.creativity),
            str(req.max_output_tokens), schema_key,
        ])
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def get(self, key: str) -> LLMResponse | None:
        response = self._entries.get(key)
        if response is not None:
            self._entries.move_to_end(key)
        return response

    def set(self, key: str, response: LLMResponse) -> None:
        self._entries[key] = response
        self._entries.move_to_end(key)
        while len(self._entries) > self._max_entries:
            self._entries.popitem(last=False)

    def clear(self) -> None:
        self._entries.clear()


llm_response_cache = LLMResponseCache()
