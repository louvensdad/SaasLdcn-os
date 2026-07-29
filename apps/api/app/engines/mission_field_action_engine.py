from __future__ import annotations

from app.engines.llm.router import LLMRouter
from app.schemas.llm import LLMRequest, ReasoningLevel

FIELD_ACTION_SYSTEM_PROMPT = (
    "Você é um {specialist} especialista, atuando dentro de uma missão do LDCN OS "
    "chamada \"{mission_title}\". O usuário está preenchendo o campo \"{field_label}\" "
    "da etapa \"{step_title}\". Responda apenas com o conteúdo solicitado pela "
    "instrução do usuário -- sem preâmbulo, sem markdown de título, sem repetir a "
    "instrução. Se faltar contexto para responder com precisão, diga explicitamente "
    "o que está faltando em vez de inventar informação."
)


def execute_field_action(
    *,
    mission_title: str,
    step_title: str,
    field_label: str,
    specialist: str,
    interpolated_prompt: str,
    router: LLMRouter | None = None,
    api_key: str | None = None,
    user_model_choice: str | None = None,
) -> tuple[str, bool]:
    """Runs one field-level AI action. Returns (content, degraded).

    The prompt template has ALREADY been interpolated client-side
    (ContextEngine.interpolatePrompt substitutes {{field}} references from the
    mission's own answers before this is ever called) -- this function only
    adds the specialist/mission framing and dispatches to the LLM."""
    router = router or LLMRouter()
    system = FIELD_ACTION_SYSTEM_PROMPT.format(
        specialist=specialist.replace("_", " "), mission_title=mission_title, field_label=field_label, step_title=step_title,
    )
    response = router.route(
        LLMRequest(system=system, user=interpolated_prompt, reasoning=ReasoningLevel.medium, max_output_tokens=2000),
        user_choice=user_model_choice,
        agent_role="mission_field_action",
        api_key=api_key,
    )
    if response.served_by_fallback or not response.text.strip():
        # Deterministic fallback: never fabricate content for a field action --
        # echo back the instruction as an explicit "pending" marker instead.
        return f"[Pendente: nenhum LLM real respondeu a esta ação. Instrução original: {interpolated_prompt.strip()}]", True
    return response.text.strip(), False
