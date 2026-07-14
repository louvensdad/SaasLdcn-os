from __future__ import annotations

import pytest

from app.engines.llm.base import LLMAdapter
from app.engines.llm.response_cache import LLMResponseCache, llm_response_cache
from app.engines.llm.router import LLMRouter
from app.schemas.llm import LLMRequest, LLMResponse, Provider


@pytest.fixture(autouse=True)
def _clear_shared_cache():
    # The router uses a module-level singleton cache -- isolate each test from
    # whatever another test in the same process already cached.
    llm_response_cache.clear()
    yield
    llm_response_cache.clear()


class _CountingAdapter(LLMAdapter):
    def __init__(self) -> None:
        self.calls = 0

    def complete(self, model: str, req: LLMRequest, *, api_key: str | None = None) -> LLMResponse:
        self.calls += 1
        return LLMResponse(provider=Provider.deepseek, model=model, text=f"response #{self.calls}")


def test_make_key_is_deterministic_for_identical_requests():
    req = LLMRequest(system="sys", user="same content")
    assert LLMResponseCache.make_key("deepseek-chat", req) == LLMResponseCache.make_key("deepseek-chat", req)


def test_make_key_differs_when_content_or_model_differs():
    base = LLMRequest(system="sys", user="content A")
    other_content = LLMRequest(system="sys", user="content B")
    key_a = LLMResponseCache.make_key("deepseek-chat", base)
    key_b = LLMResponseCache.make_key("deepseek-chat", other_content)
    key_diff_model = LLMResponseCache.make_key("deepseek-reasoner", base)
    assert key_a != key_b
    assert key_a != key_diff_model


def test_cache_get_set_round_trip():
    cache = LLMResponseCache()
    req = LLMRequest(system="sys", user="content")
    key = cache.make_key("deepseek-chat", req)
    assert cache.get(key) is None
    response = LLMResponse(provider=Provider.deepseek, model="deepseek-chat", text="hi")
    cache.set(key, response)
    assert cache.get(key) is response


def test_cache_evicts_the_least_recently_used_entry_past_max_entries():
    cache = LLMResponseCache(max_entries=2)
    for i in range(3):
        req = LLMRequest(system="sys", user=f"content {i}")
        cache.set(cache.make_key("m", req), LLMResponse(provider=Provider.deepseek, model="m", text=str(i)))
    # "content 0" was inserted first and never re-touched -- evicted first.
    assert cache.get(LLMResponseCache.make_key("m", LLMRequest(system="sys", user="content 0"))) is None
    assert cache.get(LLMResponseCache.make_key("m", LLMRequest(system="sys", user="content 1"))) is not None
    assert cache.get(LLMResponseCache.make_key("m", LLMRequest(system="sys", user="content 2"))) is not None


def test_route_never_caches_by_default():
    # allow_cache defaults to False: several real callers (most notably
    # factory_pipeline.iter_single_agent's smart retry on an empty/malformed
    # reply) deliberately resend an IDENTICAL request expecting a genuinely
    # fresh call -- caching by default would silently defeat that retry.
    adapter = _CountingAdapter()
    router = LLMRouter(adapters={"deepseek": adapter})
    req = LLMRequest(system="sys", user="identical content")

    first = router.route(req, user_choice="deepseek-chat")
    second = router.route(req, user_choice="deepseek-chat")

    assert adapter.calls == 2
    assert first.served_by_cache is False
    assert second.served_by_cache is False


def test_router_caches_identical_requests_and_skips_the_second_provider_call_when_opted_in():
    adapter = _CountingAdapter()
    router = LLMRouter(adapters={"deepseek": adapter})
    req = LLMRequest(system="sys", user="identical content")

    first = router.route(req, user_choice="deepseek-chat", allow_cache=True)
    second = router.route(req, user_choice="deepseek-chat", allow_cache=True)

    assert adapter.calls == 1
    assert first.served_by_cache is False
    assert second.served_by_cache is True
    assert second.text == first.text


def test_router_does_not_cache_a_request_with_a_user_owned_key_even_when_opted_in():
    # A user's own key must always make a real call, so they learn if it's
    # invalid/out of credit -- never silently served from cache.
    adapter = _CountingAdapter()
    router = LLMRouter(adapters={"deepseek": adapter})
    req = LLMRequest(system="sys", user="byok content")

    first = router.route(req, user_choice="deepseek-chat", api_key="sk-test-key", allow_cache=True)
    second = router.route(req, user_choice="deepseek-chat", api_key="sk-test-key", allow_cache=True)

    assert adapter.calls == 2
    assert first.served_by_cache is False
    assert second.served_by_cache is False


def test_router_differentiates_requests_that_differ_only_in_content():
    adapter = _CountingAdapter()
    router = LLMRouter(adapters={"deepseek": adapter})

    router.route(LLMRequest(system="sys", user="content A"), user_choice="deepseek-chat", allow_cache=True)
    router.route(LLMRequest(system="sys", user="content B"), user_choice="deepseek-chat", allow_cache=True)

    assert adapter.calls == 2
