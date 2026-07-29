"""Resilient agent-output parsing + smart retry.

The Meta-Factory pipeline must never stop just because an agent returned files
in a different format. These tests feed the parser the shapes real models emit
(markdown fences, JSON files array, XML, partial) and assert files are recovered
and the flow continues.
"""

from __future__ import annotations

from app.engines.factory_pipeline import iter_single_agent
from app.engines.llm.base import LLMAdapter
from app.schemas.llm import LLMRequest, LLMResponse, Provider
from app.services.file_protocol import parse_agent_output

MARKERS = '<<<FILE path="openapi.yaml">>>\nopenapi: 3.1.0\n<<<END>>>'
# Observed live from DeepSeek (2026-07-07, genjob_7b908e080e424e): the opening
# tag's closing angle brackets came out as ">>" instead of the documented ">>>".
# The strict marker regex found zero matches on an otherwise perfectly
# well-formed 58-file response, discarding all of it as "no FILE blocks found".
MARKERS_TWO_ANGLE_BRACKETS = '<<<FILE path="openapi.yaml">>\nopenapi: 3.1.0\n<<<END>>>'
MD_INFO = "```yaml openapi.yaml\nopenapi: 3.1.0\n```"
MD_LABEL = "**src/Main.java**\n```java\nclass Main {}\n```"
MD_INLINE = "```\n# file: app/models.py\nclass User: pass\n```"
JSON_FILES = '{"files": [{"path": "a.py", "content": "x = 1"}, {"path": "b.ts", "content": "y"}]}'
XML_FILES = '<file path="Dockerfile">FROM python:3.12</file>'


def _router(adapter):
    from app.engines.llm.router import LLMRouter

    router = LLMRouter()
    router._adapters = {Provider.anthropic.value: adapter}  # type: ignore[attr-defined]
    return router


class _StaticAdapter(LLMAdapter):
    def __init__(self, text: str):
        self._text = text

    def complete(self, model: str, req: LLMRequest, *, api_key=None) -> LLMResponse:  # noqa: ANN001
        return LLMResponse(provider=Provider.anthropic, model=model, text=self._text)


# --- parser-level recovery -------------------------------------------------

def test_markers_strategy_full_confidence():
    r = parse_agent_output(MARKERS, agent_role="contracts")
    assert r.ok and r.parser_strategy == "markers" and r.parser_confidence == 1.0


def test_markers_tolerate_two_closing_angle_brackets():
    r = parse_agent_output(MARKERS_TWO_ANGLE_BRACKETS, agent_role="contracts")
    assert r.ok and r.parser_strategy == "markers" and r.parser_confidence == 1.0
    assert [f.path for f in r.files] == ["openapi.yaml"]


def test_markdown_info_string_path():
    r = parse_agent_output(MD_INFO, agent_role="contracts")
    assert r.ok and [f.path for f in r.files] == ["openapi.yaml"]
    assert r.parser_strategy == "markdown"


def test_markdown_label_before_fence():
    r = parse_agent_output(MD_LABEL, agent_role="backend")
    assert [f.path for f in r.files] == ["src/Main.java"]


def test_markdown_inline_file_comment():
    r = parse_agent_output(MD_INLINE)
    assert [f.path for f in r.files] == ["app/models.py"]
    assert "class User" in r.files[0].content


def test_json_files_array():
    r = parse_agent_output(JSON_FILES)
    assert {f.path for f in r.files} == {"a.py", "b.ts"} and r.parser_strategy == "json"


def test_xml_file_tags():
    r = parse_agent_output(XML_FILES)
    assert [f.path for f in r.files] == ["Dockerfile"] and r.parser_strategy == "xml"


def test_truly_empty_is_the_only_error():
    r = parse_agent_output("desculpe, não consegui gerar agora.")
    assert not r.ok and r.parser_strategy == "none"
    assert r.raw_response  # never lost


def test_diagnostics_payload_shape():
    r = parse_agent_output(MD_INFO, agent_role="contracts")
    diag = r.diagnostics()
    assert diag["parser_strategy"] == "markdown"
    assert 0 < diag["parser_confidence"] <= 1
    assert diag["file_count"] == 1


# --- pipeline-level: format difference never stops the stage ---------------

def test_pipeline_recovers_markdown_without_markers():
    events = list(iter_single_agent(_router(_StaticAdapter(MD_LABEL)), "backend", "ctx"))
    finished = next(e for e in events if e["type"] == "agent_finished")
    assert finished["file_count"] == 1
    assert finished["parser_strategy"] == "markdown"
    assert finished["errors"] == []
    # The gate passes (stage not failed) despite no <<<FILE>>> markers.
    gate = next(e for e in events if e["type"] == "gate_check")
    assert gate["status"] == "passed"


def test_smart_retry_logs_three_attempts_then_gives_clear_reason():
    # Always empty → 3 attempts, all logged, clear failure reason, raw kept.
    events = list(iter_single_agent(_router(_StaticAdapter("nada parseável aqui")), "contracts", "ctx"))
    result = next(e for e in events if e["type"] == "result")["parsed"]
    assert len(result.attempts) == 3
    assert all(a["ok"] is False for a in result.attempts)
    assert result.attempts[0]["reason"]
    finished = next(e for e in events if e["type"] == "agent_finished")
    assert finished["parser_confidence"] == 0.0
    assert len(finished["attempts"]) == 3
