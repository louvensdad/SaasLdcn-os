from __future__ import annotations

from app.engines.architect_engine import build_blueprint
from app.schemas.architecture_blueprint import BLUEPRINT_AREAS
from app.schemas.orchestrator import ProjectSpec, SuggestedStack
from app.schemas.llm import LLMResponse, Provider
from app.engines.llm.base import LLMError
import pytest


def _spec() -> ProjectSpec:
    return ProjectSpec(
        raw_intent="Quero um SaaS para clínica odontológica",
        product_summary="SaaS para gestão de clínica odontológica",
        target_users=["Administrador", "Profissional de saúde", "Paciente"],
        entities=["Paciente", "Profissional", "Agendamento", "Pagamento"],
        business_rules=["Agendamento não pode colidir.", "Prontuário só ao responsável."],
        non_functional={"compliance": "LGPD para dados de saúde."},
        suggested_stack=SuggestedStack(language="python", framework="fastapi", architecture="modular_monolith"),
    )


def test_deterministic_blueprint_covers_all_areas_with_justifications():
    bp = build_blueprint(_spec(), project_id="room_abc")
    areas = {d.area for d in bp.decisions}
    assert set(BLUEPRINT_AREAS) <= areas  # every architectural area is decided
    assert all(d.choice.strip() for d in bp.decisions)
    assert all(d.justification.strip() for d in bp.decisions)  # nothing chosen without a reason
    assert bp.degraded is True  # no key -> deterministic, honestly flagged
    assert bp.project_id == "room_abc"


def test_blueprint_reflects_spec_domain():
    bp = build_blueprint(_spec(), project_id="room_abc")
    db = next(d for d in bp.decisions if d.area == "database")
    # The DB justification references the spec's entities.
    assert "Paciente" in db.justification or "entidades" in db.justification.lower()


def test_llm_blueprint_persists_canonical_provider_metadata(monkeypatch):
    from app.engines.llm.router import LLMRouter

    response = LLMResponse(
        provider=Provider.anthropic,
        model="claude-sonnet-4",
        text="{}",
        parsed={"decisions": [{"area": "backend", "choice": "FastAPI", "justification": "Contrato tipado.", "alternatives_considered": ["NestJS"], "tradeoffs": ["Ecossistema Python"]}]},
        usage={"input_tokens": 100, "output_tokens": 50, "total_tokens": 150},
        served_by_fallback=False,
    )
    monkeypatch.setattr(LLMRouter, "route", lambda *args, **kwargs: response)
    blueprint = build_blueprint(_spec(), project_id="room_llm", api_key="secret", user_model_choice="claude-sonnet-4")
    assert blueprint.degraded is False
    assert blueprint.mode == "llm"
    assert blueprint.provider == "anthropic"
    assert blueprint.providerLabel == "Claude"
    assert blueprint.model == "claude-sonnet-4"
    assert blueprint.source == "llm"
    assert blueprint.tokensUsed == 150
    assert blueprint.llmMetadata["servedByFallback"] is False


def test_resolved_llm_never_silently_saves_deterministic_fallback(monkeypatch):
    from app.engines.llm.router import LLMRouter

    response = LLMResponse(provider=Provider.anthropic, model="claude-sonnet-4", text="{}", parsed=None, served_by_fallback=True)
    monkeypatch.setattr(LLMRouter, "route", lambda *args, **kwargs: response)
    with pytest.raises(LLMError):
        build_blueprint(_spec(), project_id="room_llm", api_key="secret", user_model_choice="claude-sonnet-4")


def test_llm_blueprint_recovered_from_markdown_fenced_json(monkeypatch):
    """Resilient pipeline: a provider that wraps its JSON in a ```json fence with
    prose around it must still produce a real blueprint — never rejected."""
    from app.engines.llm.router import LLMRouter

    text = (
        "Claro! Segue a arquitetura:\n```json\n"
        '{"decisions": [{"area": "backend", "choice": "FastAPI", "justification": "tipado"},'
        ' {"area": "frontend", "choice": "Next.js", "justification": "SSR"}]}'
        "\n```\nAbraços."
    )
    # parsed=None because the adapter could not strict-parse the fenced text.
    response = LLMResponse(provider=Provider.anthropic, model="claude-sonnet-4", text=text, parsed=None, served_by_fallback=False)
    monkeypatch.setattr(LLMRouter, "route", lambda *args, **kwargs: response)
    bp = build_blueprint(_spec(), project_id="room_md", api_key="secret", user_model_choice="claude-sonnet-4")
    assert bp.mode == "llm" and bp.degraded is False
    areas = {d.area for d in bp.decisions}
    assert {"backend", "frontend"} <= areas
    assert bp.responseDiagnostics is not None
    assert bp.responseDiagnostics["extractor_used"] == "fenced_json"
