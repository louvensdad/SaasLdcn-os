from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.core.database import database_url_for, session_factory
from app.core.logging import logger
from app.data.model_registry import MODEL_REGISTRY
from app.models.llm_usage import LlmUsageRecord


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def estimate_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    """Return the registry-backed estimated cost, or zero when pricing is unknown."""
    meta = MODEL_REGISTRY.get(model, {})
    in_price = float(meta.get("in_per_mtok", 0.0))
    out_price = float(meta.get("out_per_mtok", 0.0))
    return input_tokens * in_price / 1_000_000 + output_tokens * out_price / 1_000_000


class LlmUsageRepository:
    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self._sessions = session_factory(self.database_url)

    def record(
        self,
        *,
        provider: str,
        model: str,
        usage: dict,
        served_by_cache: bool,
        latency_ms: int,
    ) -> None:
        input_tokens = int(usage.get("input", 0) or 0)
        output_tokens = int(usage.get("output", 0) or 0)
        cache_read_tokens = int(usage.get("cache_read", 0) or 0)
        with self._sessions.begin() as session:
            session.add(
                LlmUsageRecord(
                    id=f"llmuse_{uuid4().hex[:12]}",
                    provider=provider,
                    model=model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    cache_read_tokens=cache_read_tokens,
                    served_by_cache=served_by_cache,
                    latency_ms=latency_ms,
                    estimated_cost_usd=estimate_cost_usd(model, input_tokens, output_tokens),
                    created_at=_now().isoformat(),
                )
            )

    def stats(self, window_hours: int = 24) -> dict[str, Any]:
        """Aggregates the last `window_hours` plus the window before it (for
        real percent-deltas), with per-hour buckets for sparklines."""
        now = _now()
        window_start = now - timedelta(hours=window_hours)
        previous_start = now - timedelta(hours=2 * window_hours)
        with self._sessions() as session:
            rows = session.scalars(
                select(LlmUsageRecord)
                .where(LlmUsageRecord.created_at >= previous_start.isoformat())
                .order_by(LlmUsageRecord.created_at.asc())
            ).all()

        current = [r for r in rows if r.created_at >= window_start.isoformat()]
        previous = [r for r in rows if r.created_at < window_start.isoformat()]

        def _totals(items: list[LlmUsageRecord]) -> dict[str, Any]:
            provider_calls = [r for r in items if not r.served_by_cache]
            cache_served = [r for r in items if r.served_by_cache]
            latencies = [r.latency_ms for r in provider_calls if r.latency_ms > 0]
            return {
                "requests": len(items),
                "input_tokens": sum(r.input_tokens for r in provider_calls),
                "output_tokens": sum(r.output_tokens for r in provider_calls),
                "cache_read_tokens": sum(r.cache_read_tokens for r in provider_calls),
                # Tokens a cache-served response would have re-spent -- real savings.
                "saved_tokens": sum(r.input_tokens + r.output_tokens for r in cache_served),
                "avg_latency_ms": (sum(latencies) / len(latencies)) if latencies else None,
                "estimated_cost_usd": sum(r.estimated_cost_usd for r in provider_calls),
                "cache_savings_usd": sum(
                    estimate_cost_usd(r.model, r.input_tokens, r.output_tokens) for r in cache_served
                ),
            }

        buckets: list[dict[str, Any]] = []
        # Hour-aligned so the current (partial) hour is the last bucket --
        # anchoring at `now - window` would leave records from this hour
        # matching no bucket prefix.
        top_of_hour = now.replace(minute=0, second=0)
        for offset in range(window_hours):
            start = top_of_hour - timedelta(hours=window_hours - 1 - offset)
            prefix = start.isoformat()[:13]  # YYYY-MM-DDTHH
            hour_rows = [r for r in current if r.created_at[:13] == prefix]
            latencies = [r.latency_ms for r in hour_rows if not r.served_by_cache and r.latency_ms > 0]
            buckets.append(
                {
                    "hour": prefix,
                    "requests": len(hour_rows),
                    "tokens": sum(r.input_tokens + r.output_tokens for r in hour_rows),
                    "avg_latency_ms": (sum(latencies) / len(latencies)) if latencies else 0,
                    "cost_usd": sum(r.estimated_cost_usd for r in hour_rows),
                }
            )

        return {"window_hours": window_hours, **_totals(current), "previous": _totals(previous), "buckets": buckets}

    def stats_by_model(self, window_hours: int = 24) -> list[dict[str, Any]]:
        """Real per-model comparison from actual `llm_usage_records` rows --
        not a synthetic benchmark race. A model with zero calls in the window
        simply doesn't appear; there is nothing honest to report about it."""
        now = _now()
        window_start = now - timedelta(hours=window_hours)
        with self._sessions() as session:
            rows = session.scalars(
                select(LlmUsageRecord).where(LlmUsageRecord.created_at >= window_start.isoformat())
            ).all()

        by_model: dict[str, list[LlmUsageRecord]] = {}
        for row in rows:
            by_model.setdefault(row.model, []).append(row)

        results: list[dict[str, Any]] = []
        for model, items in by_model.items():
            provider_calls = [r for r in items if not r.served_by_cache]
            cache_served = [r for r in items if r.served_by_cache]
            latencies = [r.latency_ms for r in provider_calls if r.latency_ms > 0]
            results.append(
                {
                    "model": model,
                    "provider": items[0].provider,
                    "requests": len(items),
                    "avg_latency_ms": (sum(latencies) / len(latencies)) if latencies else None,
                    "estimated_cost_usd": sum(r.estimated_cost_usd for r in provider_calls),
                    "cache_hit_rate": (len(cache_served) / len(items)) if items else 0.0,
                }
            )
        results.sort(key=lambda entry: entry["requests"], reverse=True)
        return results


def record_usage_safely(
    *, provider: str, model: str, usage: dict, served_by_cache: bool, latency_ms: int
) -> None:
    """Fault-isolated single entry point used by the router: telemetry must
    never break (or slow-fail) a real generation call."""
    try:
        LlmUsageRepository().record(
            provider=provider, model=model, usage=usage,
            served_by_cache=served_by_cache, latency_ms=latency_ms,
        )
    except Exception as exc:  # noqa: BLE001 -- deliberate isolation boundary
        logger.warning("llm usage telemetry failed (ignored): %s", exc)
