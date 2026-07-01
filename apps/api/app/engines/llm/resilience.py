from __future__ import annotations

import random
import threading
import time
from dataclasses import dataclass

from app.engines.llm.base import LLMError

# Retry + circuit-breaker primitives for the LLM transport (diagnosis M1).
#
# The factory hits one provider with six sequential agent calls; without backoff a
# single 429 cascades into six, and without a breaker a dead provider is re-hit on
# every agent (each blocking up to the full per-request timeout). These two pieces
# give the router exponential backoff with jitter for transient failures and a
# fast-fail breaker that trips after repeated transient failures per provider.


@dataclass(frozen=True)
class RetryPolicy:
    max_attempts: int = 3
    base_delay_s: float = 0.5
    max_delay_s: float = 8.0
    jitter_s: float = 0.25

    def backoff(self, attempt: int) -> float:
        """Delay before the next attempt (``attempt`` is the 1-based number of the
        attempt that just failed). Exponential, capped, with additive jitter so a
        burst of agents does not retry in lockstep."""
        delay = min(self.max_delay_s, self.base_delay_s * (2 ** (attempt - 1)))
        return delay + random.uniform(0.0, self.jitter_s)


class CircuitOpenError(LLMError):
    """Raised when the breaker for a provider is open. Modeled as a transient
    LLMError so existing handling (mock fallback on the server-key path, HTTP 502
    on the user-key path) treats it uniformly."""

    def __init__(self, provider: str, retry_after_s: float) -> None:
        super().__init__(
            f"Provider '{provider}' is temporarily unavailable (circuit open; "
            f"retry in ~{retry_after_s:.0f}s).",
            transient=True,
        )
        self.provider = provider
        self.retry_after_s = retry_after_s


@dataclass
class _Circuit:
    failures: int = 0
    opened_at: float | None = None


class CircuitBreaker:
    """Per-provider failure circuit, safe to share across threads and router
    instances (the factory and orchestrator each construct a fresh LLMRouter per
    call, so the breaker state must live above the router)."""

    def __init__(self, *, failure_threshold: int = 4, cooldown_s: float = 30.0) -> None:
        self._threshold = failure_threshold
        self._cooldown = cooldown_s
        self._circuits: dict[str, _Circuit] = {}
        self._lock = threading.Lock()

    def before(self, provider: str) -> None:
        """Raise CircuitOpenError if the provider's breaker is open and still in
        its cooldown window; otherwise allow the call (half-opening after cooldown)."""
        with self._lock:
            circuit = self._circuits.get(provider)
            if circuit is None or circuit.opened_at is None:
                return
            elapsed = time.monotonic() - circuit.opened_at
            if elapsed < self._cooldown:
                raise CircuitOpenError(provider, self._cooldown - elapsed)
            # Cooldown elapsed: half-open — let one trial call through.
            circuit.opened_at = None
            circuit.failures = 0

    def on_success(self, provider: str) -> None:
        with self._lock:
            self._circuits[provider] = _Circuit()

    def on_transient_failure(self, provider: str) -> None:
        with self._lock:
            circuit = self._circuits.setdefault(provider, _Circuit())
            circuit.failures += 1
            if circuit.failures >= self._threshold and circuit.opened_at is None:
                circuit.opened_at = time.monotonic()


# Shared defaults. Importable so the router (constructed per-call) reuses one
# breaker, and so tests can reset state if needed.
DEFAULT_RETRY_POLICY = RetryPolicy()
DEFAULT_CIRCUIT_BREAKER = CircuitBreaker()
