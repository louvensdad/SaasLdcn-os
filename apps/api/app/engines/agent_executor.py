from __future__ import annotations

import concurrent.futures as cf
import threading
from typing import Any, Callable

from app.core.config import get_settings

# Process-wide, BOUNDED thread pool for blocking LLM-agent calls.
#
# Previously every pipeline stage created its own ThreadPoolExecutor(max_workers=1)
# (factory_pipeline.iter_single_agent, generation_job_engine._route_with_timeout,
# verification_engine._with_heartbeat). A single generation spun up ~6 executors in
# sequence; N concurrent generations spun up 6*N threads with no global ceiling —
# thread starvation / OOM under moderate load (audit B5). One shared, bounded pool
# gives the whole process a hard worker ceiling and natural backpressure.
#
# Semantics on timeout: callers stop waiting and `future.cancel()` (best-effort).
# A task already running cannot be force-killed — it keeps ONE worker busy until the
# adapter's own per-request timeout returns — but the pool size caps how many such
# abandoned tasks can exist at once, which is exactly the bound we want.

_DEFAULT_WORKERS = 8

_lock = threading.Lock()
_pool: cf.ThreadPoolExecutor | None = None


def _worker_limit() -> int:
    try:
        limit = int(getattr(get_settings(), "agent_worker_limit", _DEFAULT_WORKERS))
    except (TypeError, ValueError):
        limit = _DEFAULT_WORKERS
    return max(1, limit)


def get_agent_executor() -> cf.ThreadPoolExecutor:
    """The lazily-created, shared, bounded agent executor for this process."""
    global _pool
    if _pool is None:
        with _lock:
            if _pool is None:
                _pool = cf.ThreadPoolExecutor(
                    max_workers=_worker_limit(),
                    thread_name_prefix="ldcn-agent",
                )
    return _pool


def submit_agent(fn: Callable[..., Any], *args: Any, **kwargs: Any) -> cf.Future:
    """Submit a blocking agent call to the shared bounded pool. NEVER shut this pool
    down from a caller — it is process-wide and reused by every generation."""
    return get_agent_executor().submit(fn, *args, **kwargs)


def _reset_for_tests() -> None:
    """Drop the shared pool so a test can re-create it with a fresh worker limit."""
    global _pool
    with _lock:
        if _pool is not None:
            _pool.shutdown(wait=False, cancel_futures=True)
            _pool = None
