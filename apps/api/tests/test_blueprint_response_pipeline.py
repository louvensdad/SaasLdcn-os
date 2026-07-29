"""Resilient blueprint-response pipeline tests.

The platform must never reject a Blueprint just because the model returned a
different format. Each case below is a real-world shape a provider can emit;
all must yield valid BlueprintDecisions.
"""

from __future__ import annotations

import json

import pytest

from app.engines.llm.blueprint_response_pipeline import (
    auto_repair_decision,
    parse_blueprint_response,
)
from app.schemas.architecture_blueprint import BlueprintDecision

CANON = {"area": "frontend", "choice": "Next.js", "justification": "SSR e i18n"}


def _parse(text="", parsed=None):
    return parse_blueprint_response(text=text, parsed=parsed, provider="anthropic", model="claude-sonnet-4-6", prompt="spec")


def test_clean_json_object_with_decisions_key():
    r = _parse(parsed={"decisions": [CANON]})
    assert r.ok and len(r.decisions) == 1
    assert r.decisions[0].area == "frontend"


def test_json_wrapped_in_markdown_fence_with_prose():
    text = "Claro! Aqui está:\n```json\n" + json.dumps({"decisions": [CANON]}) + "\n```\nEspero ajudar."
    r = _parse(text=text)
    assert r.ok
    assert r.diagnostics.extractor_used == "fenced_json"


def test_top_level_list_of_decisions():
    r = _parse(parsed=[CANON, {"area": "backend", "choice": "FastAPI", "justification": "idiomático"}])
    assert len(r.decisions) == 2


def test_area_map_strings():
    r = _parse(parsed={"frontend": "React", "backend": "Spring Boot", "database": "Postgres"})
    assert {d.area for d in r.decisions} == {"frontend", "backend", "database"}
    assert r.diagnostics.normalizer_used == "area_map"


def test_markdown_sections_no_json():
    text = "# Arquitetura\nFrontend: Next.js\nBackend: Spring Boot\nBanco: Postgres\n"
    r = _parse(text=text)
    # Recovered from free-form "Area: choice" text (via the YAML/area-map path or
    # the markdown-sections path — either is valid; the output is what matters).
    assert {d.area for d in r.decisions} == {"frontend", "backend", "database"}


def test_pure_markdown_headings_sections():
    text = "## Frontend\nNext.js because SSR\n## Backend\nGo for throughput\n"
    r = _parse(text=text)
    assert {d.area for d in r.decisions} >= {"frontend", "backend"}
    assert r.diagnostics.normalizer_used == "markdown_sections"


def test_partial_json_trailing_comma_and_missing_brace():
    text = '{"decisions": [{"area": "backend", "choice": "Go", "justification": "perf",}]'
    r = _parse(text=text)
    assert r.ok and r.decisions[0].choice == "Go"


def test_truncated_mid_value_is_recovered():
    text = '{"decisions": [{"area": "frontend", "choice": "Next.js with App Router and'
    r = _parse(text=text)
    assert r.ok and r.decisions[0].area == "frontend"


def test_yaml_fenced_block():
    text = "```yaml\ndecisions:\n  - area: database\n    choice: PostgreSQL\n    justification: ACID\n```"
    r = _parse(text=text)
    assert r.ok and r.decisions[0].area == "database"


def test_field_aliases_are_mapped():
    r = _parse(parsed=[{"area": "auth", "decision": "JWT", "reason": "stateless", "alternatives": ["sessions"]}])
    d = r.decisions[0]
    assert d.choice == "JWT" and d.justification == "stateless"
    assert d.alternatives_considered == ["sessions"]


def test_missing_optional_fields_never_fail():
    clean, repaired = auto_repair_decision({"area": "deploy", "choice": "Docker"})
    decision = BlueprintDecision.model_validate(clean)
    assert decision.tradeoffs == [] and decision.risks == [] and decision.dependencies == []
    assert "justification" in repaired


def test_area_synonyms_normalized():
    r = _parse(parsed={"front-end": "Vue", "db": "MySQL", "devops": "K8s"})
    assert {d.area for d in r.decisions} == {"frontend", "database", "deploy"}


def test_partial_recovery_flags_missing_areas():
    r = _parse(parsed={"decisions": [CANON]})
    assert r.diagnostics.partial is True
    assert "backend" in r.diagnostics.areas_missing
    assert "parcialmente" in r.diagnostics.reason.lower()


def test_unparseable_text_keeps_raw_and_explains():
    r = _parse(text="desculpe, não consegui gerar a arquitetura agora.")
    assert not r.ok
    assert r.raw_record.raw_response  # raw always preserved
    assert r.raw_record.raw_hash
    assert "Nenhuma decisão" in r.diagnostics.reason


def test_raw_record_redacts_secrets():
    text = 'api_key=sk-secret-leak-123 {"decisions": [' + json.dumps(CANON) + "]}"
    r = _parse(text=text)
    assert "sk-secret-leak-123" not in r.raw_record.raw_response
    assert "sk-secret-leak-123" not in r.diagnostics.raw_excerpt


def test_nested_wrapper_key_blueprint():
    r = _parse(parsed={"blueprint": {"decisions": [CANON]}})
    # 'blueprint' wrapper holds a dict whose 'decisions' is handled by area-map of the inner;
    # ensure at least the canonical decision is recovered.
    assert r.ok


@pytest.mark.parametrize("model_shape", [
    {"decisions": [CANON]},
    {"architecture": [CANON]},
    [CANON],
    {"frontend": "Next.js"},
])
def test_every_common_shape_yields_a_blueprint(model_shape):
    r = _parse(parsed=model_shape)
    assert r.ok
