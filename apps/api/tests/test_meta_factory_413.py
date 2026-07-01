"""HTTP 413 resilience: Context Packs, budget guard, and partitioned retry.

An Enterprise project must never fail the Backend stage because the platform
tried to send everything in one giant request.
"""

from __future__ import annotations

from app.engines.context_pack_builder import (
    budget_for,
    build_agent_context,
    compress_to_budget,
    estimate_tokens,
    is_payload_too_large,
    summarize_contract,
)
from app.engines.factory_pipeline import iter_single_agent
from app.engines.llm.base import LLMAdapter, LLMError
from app.schemas.llm import LLMRequest, LLMResponse, Provider

REPLY = '<<<FILE path="apps/api/src/Main.java">>>\nclass Main {}\n<<<END>>>'


def _router(adapter):
    from app.engines.llm.router import LLMRouter

    router = LLMRouter()
    router._adapters = {Provider.anthropic.value: adapter}  # type: ignore[attr-defined]
    return router


def _big_mega() -> str:
    entities = "\n".join(f"- Entity{i}: " + ("desc " * 40) for i in range(400))
    rules = "\n".join(f"- Rule{i}: " + ("when " * 40) for i in range(400))
    return (
        "# PROJECT SPECIFICATION\n\n## Intent\nBig enterprise system\n\n"
        "## Summary\nHuge\n\n## Suggested stack\n- language: java\n\n"
        f"## Entities\n{entities}\n\n## Business rules (priority zero)\n{rules}\n\n"
        "## Architecture Blueprint (decisões)\n"
        "- frontend: Next.js — ssr\n- backend: Spring Boot — clean\n"
        "- database: Postgres — relational\n- deploy: Docker — repro\n"
    )


# 1. Backend agent does NOT receive the whole project
def test_backend_context_is_focused_not_everything():
    mega = _big_mega()
    ctx, diag = build_agent_context("backend", mega)
    assert len(ctx) < len(mega)  # smaller than the full mega
    assert diag.chars <= diag.budget_chars
    # frontend-only blueprint decision is filtered out for backend
    assert "frontend: Next.js" not in ctx


# 2. Oversized payload is compressed BEFORE sending
def test_payload_compressed_to_budget_before_send():
    mega = _big_mega()
    ctx, diag = build_agent_context("backend", mega)
    assert diag.over_budget is True and diag.compressed is True
    assert diag.compression_steps  # records HOW it was compressed
    assert len(ctx) <= budget_for("backend")


# 3. Context pack deduplicates
def test_context_pack_deduplicates():
    dupe = "## Summary\n" + "\n".join(["- repeated line"] * 50)
    out, _ = compress_to_budget(dupe, 200)
    assert out.count("- repeated line") < 50


# 4. Contract is summarized, never shipped whole (the 413 root cause)
def test_contract_is_summarized_not_full():
    body = "paths:\n" + "\n".join(f"  /resource{i}:\n    get:\n      x: " + "y" * 300 for i in range(80))
    raw = f'<<<FILE path="openapi.yaml">>>\n{body}\n<<<END>>>'
    summary = summarize_contract(raw)
    assert len(summary) < len(raw) // 5
    assert "/resource0" in summary  # endpoints preserved (traceability)
    assert "Contract summary" in summary


# 5. + 10. HTTP 413 triggers a partitioned retry and the pipeline continues
def test_413_triggers_partitioned_retry_and_continues():
    class _PayloadAdapter(LLMAdapter):
        def __init__(self):
            self.calls = 0

        def complete(self, model: str, req: LLMRequest, *, api_key=None) -> LLMResponse:  # noqa: ANN001
            self.calls += 1
            if self.calls == 1:
                raise LLMError("Request entity too large (413): prompt is too long")
            return LLMResponse(provider=Provider.anthropic, model=model, text=REPLY)

    adapter = _PayloadAdapter()
    # api_key path: a provider error propagates (no silent mock fallback), so the
    # 413 actually reaches the partitioned-retry handler.
    events = list(iter_single_agent(_router(adapter), "backend", _big_mega() * 3, api_key="k"))
    result = next(e for e in events if e["type"] == "result")["parsed"]
    assert adapter.calls == 2
    assert result.partitioned is True
    assert [f.path for f in result.files] == ["apps/api/src/Main.java"]
    finished = next(e for e in events if e["type"] == "agent_finished")
    assert finished["partitioned"] is True


# 6. Diagnostics record payload size + agent + pack
def test_diagnostics_record_size_and_pack():
    events = list(iter_single_agent(_router(_Static(REPLY)), "backend", _big_mega()))
    finished = next(e for e in events if e["type"] == "agent_finished")
    assert finished["context_pack"]["role"] == "backend"
    assert finished["context_pack"]["chars"] > 0
    assert finished["context_pack"]["estimated_tokens"] > 0
    # the send attempt logs the measured payload
    last = finished["attempts"][-1]
    assert last["payload_chars"] > 0


# 8. No agent receives irrelevant content
def test_frontend_pack_excludes_backend_only_areas():
    ctx, _ = build_agent_context("frontend", _big_mega())
    assert "database: Postgres" not in ctx
    assert "deploy: Docker" not in ctx
    assert "frontend: Next.js" in ctx  # its own area is kept


# 9. Traceability preserved (blueprint areas + contract)
def test_traceability_preserved():
    summary = summarize_contract('<<<FILE path="openapi.yaml">>>\npaths:\n  /users:\n    get: {}\n<<<END>>>')
    ctx, diag = build_agent_context("backend", _big_mega(), contract_summary=summary)
    assert "backend: Spring Boot" in ctx  # owned blueprint decision kept
    assert "openapi.yaml" in ctx  # contract reference kept
    assert "/users" in ctx


def test_payload_too_large_classifier():
    assert is_payload_too_large(LLMError("HTTP 413 Payload Too Large"))
    assert is_payload_too_large(LLMError("maximum context length exceeded"))
    assert is_payload_too_large(LLMError("prompt is too long: 250000 tokens"))
    assert not is_payload_too_large(LLMError("invalid api key"))


def test_token_estimate_monotonic():
    assert estimate_tokens("a" * 400) > estimate_tokens("a" * 40)


class _Static(LLMAdapter):
    def __init__(self, text: str):
        self._text = text

    def complete(self, model: str, req: LLMRequest, *, api_key=None) -> LLMResponse:  # noqa: ANN001
        return LLMResponse(provider=Provider.anthropic, model=model, text=self._text)


# 11. Reference-by-project_id: stage 2 needs only a slim body (the spec/blueprint
#     are persisted on stage 1), so the request never trips a proxy 413.
def test_stage_inputs_persisted_and_referenced_by_project_id():
    import shutil
    from app.routes.meta_factory import _persist_stage_inputs, _load_stage_inputs, _stage_context
    from app.services.project_writer import ProjectWriter
    from app.services.file_protocol import EmittedFile
    from app.schemas.orchestrator import ProjectSpec
    from app.schemas.meta_factory import StageGenerateRequest

    writer = ProjectWriter()
    wr = writer.write([EmittedFile(path="openapi.yaml", content="openapi: 3.1.0\npaths:\n  /pacientes:\n    get: {}\n")], project_name="t413")
    try:
        full_spec = ProjectSpec(raw_intent="grande", entities=["Paciente", "Pagamento"], business_rules=["Regra1"])
        blueprint = {"decisions": [{"area": "backend", "choice": "Spring Boot", "justification": "x"}]}
        _persist_stage_inputs(wr.root_path, full_spec, blueprint)

        # Round-trip
        loaded_spec, loaded_bp = _load_stage_inputs(wr.project_id)
        assert loaded_spec is not None and loaded_spec.entities == ["Paciente", "Pagamento"]
        assert loaded_bp["decisions"][0]["area"] == "backend"

        # A SLIM stage-2 request (no real spec/blueprint) still builds full context
        # from the persisted inputs referenced by project_id.
        slim = StageGenerateRequest(spec=ProjectSpec(raw_intent="x"), role="backend", project_id=wr.project_id, blueprint=None)
        ctx = _stage_context(slim)
        assert "Paciente" in ctx       # persisted entity reached the agent context
        assert "Spring Boot" in ctx    # persisted blueprint decision reached the context
    finally:
        shutil.rmtree(wr.root_path, ignore_errors=True)
