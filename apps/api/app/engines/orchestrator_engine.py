from __future__ import annotations

from app.engines.agent_prompts import ORCHESTRATOR_SYSTEM_PROMPT
from app.engines.llm.router import LLMRouter
from app.schemas.llm import LLMRequest, ReasoningLevel
from app.schemas.orchestrator import OrchestratorResult, ProjectSpec
from app.services.dependency_research_service import dependency_research_service

ORCHESTRATOR_ENGINE_VERSION = "0.1.0"
CONFIDENCE_GATE = 0.85
MAX_CLARIFY_ROUNDS = 3


def _compose_user_turn(raw_intent: str, prior_answers: list[dict]) -> str:
    lines = [f"Ideia do usuario:\n{raw_intent.strip()}"]
    if prior_answers:
        lines.append("\nRespostas de refinamento ja fornecidas:")
        for ans in prior_answers:
            qid = ans.get("id", "?")
            answer = ans.get("answer", "")
            lines.append(f"- [{qid}] {answer}")
    return "\n".join(lines)


def run_orchestrator(
    raw_intent: str,
    prior_answers: list[dict] | None = None,
    *,
    router: LLMRouter | None = None,
    api_key: str | None = None,
    user_model_choice: str | None = None,
) -> OrchestratorResult:
    """Stage 1: intent -> ProjectSpec via the orchestrator system prompt.

    If confidence is below the gate and clarify rounds remain, return the open
    questions for the UI. Otherwise the spec is ready to compile. Assumptions are
    materialized by the model itself (no silent invention — error #1).

    The user's model choice wins here too: it decides the provider, which must
    match the provider of any user-supplied api_key (otherwise we'd hand, say, a
    Google key to the Anthropic adapter).
    """
    prior_answers = prior_answers or []
    router = router or LLMRouter()

    response = router.route(
        LLMRequest(
            system=ORCHESTRATOR_SYSTEM_PROMPT,
            user=_compose_user_turn(raw_intent, prior_answers),
            reasoning=ReasoningLevel.high,
            json_schema=ProjectSpec.model_json_schema(),
        ),
        user_choice=user_model_choice,
        agent_role="orchestrator",
        api_key=api_key,
    )

    if response.parsed is None:
        raise ValueError("Orchestrator did not return a parseable ProjectSpec.")

    spec = ProjectSpec.model_validate(response.parsed)
    spec.raw_intent = spec.raw_intent or raw_intent

    rounds = len(prior_answers)
    needs_more = (
        spec.confidence < CONFIDENCE_GATE
        and rounds < MAX_CLARIFY_ROUNDS
        and bool(spec.open_questions)
    )

    return OrchestratorResult(
        stage="CLARIFY" if needs_more else "READY_TO_COMPILE",
        spec=spec,
        open_questions=spec.open_questions if needs_more else [],
        degraded=response.served_by_fallback,
    )


def compile_mega_prompt(spec: ProjectSpec) -> str:
    """Compile a ProjectSpec into a model-neutral Mega-Prompt.

    Per-model formatting (XML for Claude, etc.) is applied later by the adapter
    (PASSO 3), not here. This stays neutral on purpose.
    """
    stack = spec.suggested_stack
    parts = [
        "# PROJECT SPECIFICATION",
        f"## Intent\n{spec.raw_intent}",
        f"## Summary\n{spec.product_summary}",
        f"## Target users\n" + "\n".join(f"- {u}" for u in spec.target_users),
        "## Business rules (priority zero)\n"
        + "\n".join(f"- {r}" for r in spec.business_rules),
        "## Entities\n" + "\n".join(f"- {e}" for e in spec.entities),
        "## Core workflows\n" + "\n".join(f"- {w}" for w in spec.core_workflows),
        "## Non-functional\n"
        + "\n".join(f"- {k}: {v}" for k, v in spec.non_functional.items()),
        "## Suggested stack\n"
        f"- language: {stack.language}\n"
        f"- runtime: {stack.runtime}\n"
        f"- framework: {stack.framework}\n"
        f"- architecture: {stack.architecture}",
        dependency_research_service.core_versions(stack),
        localization_rules(spec.locale),
        "## Assumptions (resolved silently-missing fields)\n"
        + "\n".join(f"- {a.field}: {a.assumed_value} ({a.reason})" for a in spec.assumptions),
    ]
    return "\n\n".join(parts)


def localization_rules(locale: str) -> str:
    """The non-negotiable translation contract injected into the Mega-Prompt.

    Every agent receives this, so the rule is enforced uniformly across the
    frontend, backend, docs and tests the agents emit.
    """
    return (
        "## Localization rules (NON-NEGOTIABLE)\n"
        f"Final output language: {locale}.\n"
        f"TRANSLATE 100% to {locale}: UI text, labels, error messages, toasts, "
        "documentation (README, OpenAPI/Swagger descriptions), code comments, and "
        "every user-facing string.\n"
        "DO NOT TRANSLATE — keep in English, camelCase/snake_case: variable, function "
        "and class names; file names; API endpoint paths; and JSON / i18n keys.\n"
        "The generated frontend MUST ship with an i18n library (next-intl or "
        f"react-i18next) and populated dictionaries (at least {locale}.json and "
        "en-US.json) already wired into the app."
    )
