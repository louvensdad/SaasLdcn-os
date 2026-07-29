from __future__ import annotations

import threading
import time

from app.core import runtime_overrides
from app.engines import agent_executor
from app.engines.agent_executor import _reset_for_tests, get_agent_executor, submit_agent


def test_agent_executor_is_a_shared_singleton():
    _reset_for_tests()
    try:
        assert get_agent_executor() is get_agent_executor()
    finally:
        _reset_for_tests()


def test_agent_executor_respects_configured_worker_limit(monkeypatch):
    class _S:
        agent_worker_limit = 3

    monkeypatch.setattr(runtime_overrides, "get_settings", lambda: _S())
    _reset_for_tests()
    try:
        assert get_agent_executor()._max_workers == 3
    finally:
        _reset_for_tests()


def test_worker_limit_floor_is_one(monkeypatch):
    class _S:
        agent_worker_limit = 0

    monkeypatch.setattr(runtime_overrides, "get_settings", lambda: _S())
    _reset_for_tests()
    try:
        assert get_agent_executor()._max_workers == 1
    finally:
        _reset_for_tests()


def test_submit_agent_runs_and_returns_result():
    _reset_for_tests()
    try:
        assert submit_agent(lambda value: value * 2, 21).result(timeout=5) == 42
    finally:
        _reset_for_tests()


def test_pool_caps_global_concurrency(monkeypatch):
    # The whole point of B5: no more than `agent_worker_limit` agent tasks run at
    # once, no matter how many are submitted concurrently.
    class _S:
        agent_worker_limit = 2

    monkeypatch.setattr(runtime_overrides, "get_settings", lambda: _S())
    _reset_for_tests()
    release = threading.Event()
    lock = threading.Lock()
    state = {"current": 0, "peak": 0}

    def task() -> bool:
        with lock:
            state["current"] += 1
            state["peak"] = max(state["peak"], state["current"])
        release.wait(3.0)
        with lock:
            state["current"] -= 1
        return True

    try:
        futures = [submit_agent(task) for _ in range(6)]
        time.sleep(0.3)  # let the pool saturate
        release.set()
        for future in futures:
            assert future.result(timeout=5) is True
        assert state["peak"] <= 2
    finally:
        release.set()
        _reset_for_tests()
