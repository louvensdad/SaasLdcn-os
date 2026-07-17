from __future__ import annotations

from app.core.config import get_settings
from app.repositories.llm_usage_repository import LlmUsageRepository, estimate_cost_usd


def _repo() -> LlmUsageRepository:
    # The `client` fixture has already pointed settings at the per-test DB.
    return LlmUsageRepository(get_settings().sqlite_path)


def test_usage_stats_starts_empty(client):
    response = client.get("/api/llm/usage/stats")

    assert response.status_code == 200
    payload = response.json()
    assert payload["window_hours"] == 24
    assert payload["requests"] == 0
    assert payload["estimated_cost_usd"] == 0
    assert payload["avg_latency_ms"] is None
    assert len(payload["buckets"]) == 24


def test_recorded_calls_show_up_with_real_costs(client):
    repo = _repo()
    repo.record(
        provider="anthropic", model="claude-haiku-4-5",
        usage={"input": 1_000_000, "output": 200_000, "cache_read": 50_000},
        served_by_cache=False, latency_ms=1420,
    )
    repo.record(
        provider="anthropic", model="claude-haiku-4-5",
        usage={"input": 400_000, "output": 100_000},
        served_by_cache=True, latency_ms=2,
    )

    payload = client.get("/api/llm/usage/stats").json()
    assert payload["requests"] == 2
    assert payload["input_tokens"] == 1_000_000
    assert payload["output_tokens"] == 200_000
    assert payload["cache_read_tokens"] == 50_000
    # Cache-served response's tokens count as savings, not spend.
    assert payload["saved_tokens"] == 500_000
    # Registry prices: haiku 1.0 in / 5.0 out per MTok.
    assert abs(payload["estimated_cost_usd"] - (1.0 + 0.2 * 5.0)) < 1e-6
    assert abs(payload["cache_savings_usd"] - (0.4 + 0.1 * 5.0)) < 1e-6
    assert payload["avg_latency_ms"] == 1420
    assert sum(bucket["requests"] for bucket in payload["buckets"]) == 2


def test_router_records_usage_on_every_response(client):
    from app.engines.llm.router import LLMRouter
    from app.schemas.llm import LLMRequest

    router = LLMRouter()
    settings = get_settings()
    previous = settings.force_mock
    settings.force_mock = True
    try:
        router.route(LLMRequest(system="test system", user="hello"))
    finally:
        settings.force_mock = previous

    payload = client.get("/api/llm/usage/stats").json()
    assert payload["requests"] >= 1


def test_unknown_model_costs_zero_not_fabricated():
    assert estimate_cost_usd("some-unknown-model", 1_000_000, 1_000_000) == 0.0
