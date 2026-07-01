from __future__ import annotations

import difflib
import os

import pytest

from app.core.config import get_settings
from app.engines.orchestrator_engine import run_orchestrator
from app.engines.prompt_master_md_engine import author_prompt_master_md

INTENTS = {
    "clinica": "Quero um CRM para clínica odontológica",
    "deposito": "Quero um sistema para depósito de cana",
    "marketplace": "Quero um marketplace de aluguel de tratores",
}


@pytest.fixture
def force_mock(monkeypatch):
    monkeypatch.setenv("LDCN_FORCE_MOCK", "1")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a, b).ratio() * 100


def test_deterministic_fallback_is_domain_adapted(force_mock):
    """No key -> deterministic, but no longer ~98% identical: the domain profiles
    give each idea distinct users/entities, so the documents diverge meaningfully."""
    specs = {k: run_orchestrator(v, []).spec for k, v in INTENTS.items()}
    docs = {k: author_prompt_master_md(s, version=1)["markdown"] for k, s in specs.items()}

    # Each turn was deterministic (mock) -> documents flagged degraded.
    assert all(author_prompt_master_md(s, version=1)["degraded"] for s in specs.values())

    # Domain adaptation: entities and users actually differ per domain.
    assert specs["clinica"].entities != specs["deposito"].entities
    assert specs["deposito"].entities != specs["marketplace"].entities
    assert specs["clinica"].target_users != specs["marketplace"].target_users
    assert "Paciente" in specs["clinica"].entities
    assert "Produto" in specs["deposito"].entities

    # Item 4: the inferred vertical (system_type) differs per domain.
    assert specs["clinica"].system_type != specs["marketplace"].system_type
    assert specs["clinica"].system_type

    pairs = [("clinica", "deposito"), ("clinica", "marketplace"), ("deposito", "marketplace")]
    sims = {f"{a}-{b}": _similarity(docs[a], docs[b]) for a, b in pairs}
    # Was ~97.9% before domain profiles. Assert a clear, honest improvement.
    assert max(sims.values()) < 88.0, sims


@pytest.mark.skipif(
    not os.environ.get("LDCN_TEST_LLM_KEY"),
    reason="real LLM key not configured (set LDCN_TEST_LLM_KEY / LDCN_TEST_LLM_MODEL to run the official <60% check)",
)
def test_llm_authored_promptmaster_under_60_percent():
    """Official target: with a REAL provider, two different domains must produce
    PromptMasters that are < 60% similar."""
    key = os.environ["LDCN_TEST_LLM_KEY"]
    model = os.environ.get("LDCN_TEST_LLM_MODEL")
    docs = {}
    for name, intent in INTENTS.items():
        spec = run_orchestrator(intent, [], api_key=key, user_model_choice=model).spec
        doc = author_prompt_master_md(spec, version=1, api_key=key, user_model_choice=model)
        assert doc["degraded"] is False
        docs[name] = doc["markdown"]
    worst = max(
        _similarity(docs["clinica"], docs["deposito"]),
        _similarity(docs["clinica"], docs["marketplace"]),
        _similarity(docs["deposito"], docs["marketplace"]),
    )
    assert worst < 60.0, worst
