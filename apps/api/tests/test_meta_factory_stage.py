from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path

import pytest

from app.engines.completeness_review_engine import CompletenessReviewEngine
from app.engines.factory_pipeline import iter_single_agent
from app.engines.llm.base import LLMAdapter, LLMError
from app.engines.llm.router import LLMRouter
from app.schemas.llm import LLMRequest, LLMResponse, Provider
from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter, ProjectWriteError
from app.schemas.orchestrator import ProjectSpec, SuggestedStack


# --- stub adapters --------------------------------------------------------

class _FixedAdapter(LLMAdapter):
    """Returns the same protocol reply for any agent."""

    def __init__(self, text: str):
        self.text = text

    def complete(self, model: str, req: LLMRequest) -> LLMResponse:
        return LLMResponse(provider=Provider.anthropic, model=model, text=self.text, stopped_by="end_turn")


class _RaisingRouter:
    """Stands in for an LLMRouter whose provider call fails outright (no mock
    fallback — e.g. the user-key path), so we can test that iter_single_agent
    contains the failure instead of propagating it."""

    def route(self, req: LLMRequest, **kwargs) -> LLMResponse:
        raise LLMError("provider exploded (503)")


def _router(adapter: LLMAdapter) -> LLMRouter:
    return LLMRouter(adapters={"anthropic": adapter, "openai": adapter, "google": adapter})


@pytest.fixture
def out_root():
    # pytest's tmp_path base dir is not writable in this environment; use a plain
    # temp dir we create and remove ourselves.
    path = Path(tempfile.mkdtemp())
    try:
        yield path
    finally:
        shutil.rmtree(path, ignore_errors=True)


CONTRACT_REPLY = '<<<FILE path="openapi.yaml">>>\nopenapi: 3.1.0\n<<<END>>>'


# --- iter_single_agent ----------------------------------------------------

def test_single_agent_emits_events_and_result():
    events = list(iter_single_agent(_router(_FixedAdapter(CONTRACT_REPLY)), "contracts", "ctx"))
    types = [e["type"] for e in events]
    assert types[0] == "agent_started"
    assert "file_emitted" in types and "gate_check" in types and "agent_finished" in types
    assert types[-1] == "result"
    result = events[-1]
    assert [f.path for f in result["parsed"].files] == ["openapi.yaml"]
    assert result["response"] is not None


def test_single_agent_failure_is_contained_not_raised():
    # A provider error becomes a failed result with an error message — never an
    # exception that would abort the surrounding per-stage request.
    events = list(iter_single_agent(_RaisingRouter(), "backend", "ctx"))
    result = events[-1]
    assert result["type"] == "result"
    assert result["response"] is None
    assert result["parsed"].files == []
    assert any("backend falhou" in e for e in result["parsed"].errors)
    finished = next(e for e in events if e["type"] == "agent_finished")
    assert finished["file_count"] == 0 and finished["errors"]


def test_provider_error_reason_is_recorded_not_lost():
    # The real failure reason must be captured in the attempts log (so the
    # agent_finished diagnostics show WHY a stage produced 0 files), instead of
    # the old opaque "attempts=0" with no cause.
    events = list(iter_single_agent(_RaisingRouter(), "contracts", "ctx"))
    finished = next(e for e in events if e["type"] == "agent_finished")
    assert finished["attempts"], "the failed attempt must be logged"
    last = finished["attempts"][-1]
    assert last["ok"] is False
    assert "provider exploded (503)" in last["reason"]
    assert last["event"] == "llm_error"


def test_single_agent_retries_once_on_empty_reply():
    # First call empty, second call valid -> recovered with a warning.
    class _FlakyAdapter(LLMAdapter):
        def __init__(self):
            self.calls = 0

        def complete(self, model: str, req: LLMRequest) -> LLMResponse:
            self.calls += 1
            text = "" if self.calls == 1 else CONTRACT_REPLY
            return LLMResponse(provider=Provider.anthropic, model=model, text=text)

    adapter = _FlakyAdapter()
    events = list(iter_single_agent(_router(adapter), "contracts", "ctx"))
    result = events[-1]
    assert adapter.calls == 2
    assert [f.path for f in result["parsed"].files] == ["openapi.yaml"]
    # Recovered on the retry — the smart-retry log records both attempts.
    assert any("tentativa" in w.lower() for w in result["parsed"].warnings)
    assert len(result["parsed"].attempts) == 2
    assert result["parsed"].attempts[0]["ok"] is False
    assert result["parsed"].attempts[1]["ok"] is True


# --- incremental persistence ---------------------------------------------

def test_writer_append_accumulates_files_and_marker(out_root):
    writer = ProjectWriter(output_root=out_root)
    first = writer.write([EmittedFile(path="openapi.yaml", content="openapi: 3.1.0")], project_name="demo")
    assert first.file_count == 1

    second = writer.append(first.project_id, [EmittedFile(path="src/Main.java", content="class Main {}")])
    assert second.project_id == first.project_id
    assert second.file_count == 2  # cumulative, not just this stage
    assert "openapi.yaml" in second.written and "src/Main.java" in second.written

    marker = json.loads((out_root / first.project_id / ".ldcn-generation.json").read_text(encoding="utf-8"))
    assert marker["file_count"] == 2
    assert set(marker["files"]) >= {"openapi.yaml", "src/Main.java"}


def test_writer_append_overwrites_duplicate_path(out_root):
    writer = ProjectWriter(output_root=out_root)
    created = writer.write([EmittedFile(path="a.txt", content="v1")], project_name="demo")
    writer.append(created.project_id, [EmittedFile(path="a.txt", content="v2")])
    assert (out_root / created.project_id / "a.txt").read_text(encoding="utf-8") == "v2"


def test_writer_append_rejects_unknown_or_unsafe_project_id(out_root):
    writer = ProjectWriter(output_root=out_root)
    with pytest.raises(ProjectWriteError):
        writer.append("does-not-exist", [EmittedFile(path="a.txt", content="x")])
    with pytest.raises(ProjectWriteError):
        writer.append("../escape", [EmittedFile(path="a.txt", content="x")])

@pytest.mark.parametrize(
    ("path", "content"),
    [
        (".env", "DATABASE_URL=postgresql://real-user:real-password@db/prod"),
        ("keys/id_rsa", "-----BEGIN OPENSSH PRIVATE KEY-----\nsecret"),
        ("config.py", "api_key = 'sk-proj-abcdefghijklmnopqrstuvwxyz'"),
    ],
)
def test_writer_blocks_real_secret_artifacts(out_root, path, content):
    with pytest.raises(ProjectWriteError, match="blocked"):
        ProjectWriter(output_root=out_root).write([EmittedFile(path=path, content=content)])


def test_writer_allows_env_example_with_placeholders(out_root):
    result = ProjectWriter(output_root=out_root).write(
        [EmittedFile(path=".env.example", content="API_KEY=change-me\nDATABASE_URL=example")]
    )
    assert ".env.example" in result.written

# --- completeness review --------------------------------------------------

def _spec() -> ProjectSpec:
    return ProjectSpec(
        raw_intent="help desk",
        product_summary="Help Desk SaaS",
        target_users=["ADMIN"],
        business_rules=["Cliente só vê seus chamados"],
        entities=["Chamado"],
        core_workflows=["Abrir chamado"],
        suggested_stack=SuggestedStack(),
    )


class _StubFiles:
    def list_files(self, project):
        return {"files": [{"relative_path": "openapi.yaml"}, {"relative_path": "src/Main.java"}]}

    def read_file(self, project, path):
        return {"content": "openapi: 3.1.0" if "openapi" in path else "class Main {}"}


def test_completeness_review_parses_report_and_propagates_degraded():
    payload = {
        "completeness_score": 75,
        "items": [
            {"item": "Cliente só vê seus chamados", "kind": "business_rule",
             "status": "covered", "evidence": ["src/Main.java"], "note": ""}
        ],
        "gaps": ["Falta rate limiting"],
        "recommendations": ["Adicionar testes"],
    }

    class _ReviewerAdapter(LLMAdapter):
        def complete(self, model: str, req: LLMRequest) -> LLMResponse:
            assert req.json_schema is not None  # structured output is requested
            return LLMResponse(
                provider=Provider.anthropic, model=model, text=json.dumps(payload),
                parsed=payload, served_by_fallback=True,
            )

    engine = CompletenessReviewEngine(router=_router(_ReviewerAdapter()), files_service=_StubFiles())
    report = engine.review(_spec(), {"project_id": "demo_123", "generated_project_path": "/x"})
    assert report.completeness_score == 75
    assert report.project_id == "demo_123"  # filled from project when model omits it
    assert report.items[0].status == "covered"
    assert report.degraded is True  # propagated from served_by_fallback
