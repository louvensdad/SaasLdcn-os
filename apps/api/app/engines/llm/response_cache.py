from __future__ import annotations

import hashlib
import json
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Callable

from app.core.metrics import LLM_CACHE_BYTES, LLM_CACHE_ENTRIES, LLM_CACHE_EVENTS
from app.schemas.llm import LLMRequest, LLMResponse

_MAX_ENTRIES = 256
_MAX_BYTES = 32 * 1024 * 1024
_TTL_SECONDS = 900.0
_CACHE_POLICY_VERSION = "llm-response-v2"


@dataclass(frozen=True)
class _Entry:
    response: LLMResponse
    size_bytes: int
    expires_at: float


class LLMResponseCache:
    """Process-local, thread-safe LRU cache for explicitly cacheable LLM calls."""

    def __init__(
        self,
        max_entries: int = _MAX_ENTRIES,
        *,
        max_bytes: int = _MAX_BYTES,
        ttl_seconds: float = _TTL_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._max_entries = max(1, int(max_entries))
        self._max_bytes = max(1, int(max_bytes))
        self._ttl_seconds = max(0.001, float(ttl_seconds))
        self._clock = clock
        self._entries: OrderedDict[str, _Entry] = OrderedDict()
        self._size_bytes = 0
        self._lock = threading.RLock()
        self._publish_size()

    @staticmethod
    def make_key(
        model: str,
        req: LLMRequest,
        *,
        namespace: str = "shared-platform",
        policy_version: str = _CACHE_POLICY_VERSION,
    ) -> str:
        schema_key = json.dumps(req.json_schema, sort_keys=True, separators=(",", ":")) if req.json_schema else ""
        payload = "\x1f".join([
            policy_version, namespace, model, req.system, req.user,
            req.reasoning.value, repr(req.creativity), str(req.max_output_tokens), schema_key,
        ])
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def get(self, key: str) -> LLMResponse | None:
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                LLM_CACHE_EVENTS.labels(outcome="miss").inc()
                return None
            if entry.expires_at <= self._clock():
                self._remove_locked(key)
                LLM_CACHE_EVENTS.labels(outcome="expired").inc()
                self._publish_size()
                return None
            self._entries.move_to_end(key)
            LLM_CACHE_EVENTS.labels(outcome="hit").inc()
            return entry.response

    def set(self, key: str, response: LLMResponse) -> bool:
        size_bytes = len(response.model_dump_json().encode("utf-8"))
        if size_bytes > self._max_bytes:
            LLM_CACHE_EVENTS.labels(outcome="oversized").inc()
            return False
        with self._lock:
            self._remove_locked(key)
            self._entries[key] = _Entry(response, size_bytes, self._clock() + self._ttl_seconds)
            self._size_bytes += size_bytes
            self._entries.move_to_end(key)
            while len(self._entries) > self._max_entries or self._size_bytes > self._max_bytes:
                _, evicted = self._entries.popitem(last=False)
                self._size_bytes -= evicted.size_bytes
                LLM_CACHE_EVENTS.labels(outcome="evicted").inc()
            LLM_CACHE_EVENTS.labels(outcome="stored").inc()
            self._publish_size()
            return True

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()
            self._size_bytes = 0
            self._publish_size()

    def snapshot(self) -> dict[str, int]:
        with self._lock:
            return {"entries": len(self._entries), "bytes": self._size_bytes}

    def _remove_locked(self, key: str) -> None:
        previous = self._entries.pop(key, None)
        if previous is not None:
            self._size_bytes -= previous.size_bytes

    def _publish_size(self) -> None:
        LLM_CACHE_ENTRIES.set(len(self._entries))
        LLM_CACHE_BYTES.set(self._size_bytes)


llm_response_cache = LLMResponseCache()