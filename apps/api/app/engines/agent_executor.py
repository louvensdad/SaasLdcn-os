from __future__ import annotations

import concurrent.futures as cf
import threading
from typing import Any, Callable

from app.core import runtime_overrides

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

_lock = threading.Lock()
_pool: cf.ThreadPoolExecutor | None = None


def _worker_limit() -> int:
    return runtime_overrides.get_worker_limit()


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


def resize_pool(new_limit: int) -> int:
    """Live-resize the shared pool (clamped to
    runtime_overrides.WORKER_LIMIT_MIN/MAX). In-flight tasks are left to
    finish on the old pool (`cancel_futures=False`, `wait=False`) -- only
    queued-but-not-started tasks are dropped, which is the same acceptable
    loss as any other worker-count change on a live process. The next
    `get_agent_executor()` call lazily recreates the pool at the new size.
    Returns the clamped value that actually took effect."""
    clamped = runtime_overrides.set_worker_limit(new_limit)
    global _pool
    with _lock:
        if _pool is not None:
            _pool.shutdown(wait=False, cancel_futures=False)
            _pool = None
    return clamped


def _reset_for_tests() -> None:
    """Drop the shared pool so a test can re-create it with a fresh worker limit."""
    global _pool
    with _lock:
        if _pool is not None:
            _pool.shutdown(wait=False, cancel_futures=True)
            _pool = None
    runtime_overrides._reset_for_tests()
