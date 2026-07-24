from __future__ import annotations

from typing import Any

from app.engines.llm.router import LLMRouter
from app.schemas.llm import LLMRequest, ReasoningLevel

DRAFT_SYSTEM_PROMPT = (
    "Você é um engenheiro de software sênior redigindo o artefato \"{artifact_title}\" "
    "(tipo {artifact_type}) da missão \"{mission_title}\". Em <mission_context> está "
    "TUDO que o usuário respondeu na missão, organizado por etapa, mais as decisões já "
    "tomadas -- é a fonte de verdade e nunca deve ser contradita.\n\n"
    "Escreva o conteúdo completo e específico deste artefato em markdown, usando as "
    "respostas do usuário como base real, não como um resumo delas. Onde uma "
    "informação relevante para este artefato estiver ausente ou incompleta, "
    "complemente com uma recomendação sensata e coloque esse complemento sob um "
    "cabeçalho final \"## Complementado pela IA\", explicando o que foi assumido e "
    "por quê -- nunca misture complementos com as respostas originais do usuário sem "
    "essa marcação explícita. Responda apenas com o markdown do artefato, sem "
    "comentários fora dele."
)


def _render_answers_for_step(step_id: str, answers: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    prefix = f"{step_id}."
    for key, value in answers.items():
        if not key.startswith(prefix):
            continue
        field_id = key[len(prefix):]
        if value in (None, "", [], {}):
            continue
        rendered = ", ".join(str(v) for v in value) if isinstance(value, list) else str(value)
        lines.append(f"- **{field_id}**: {rendered}")
    return lines


def _compile_body(artifact_title: str, step_titles: dict[str, str], answers: dict[str, Any], decisions: list[dict[str, Any]]) -> str:
    sections = [f"# {artifact_title}", ""]
    for step_id, step_title in step_titles.items():
        lines = _render_answers_for_step(step_id, answers)
        sections.append(f"## {step_title}")
        sections.extend(lines if lines else ["_Nenhuma informação registrada nesta etapa._"])
        sections.append("")
    if decisions:
        sections.append("## Decisões")
        sections.extend(
            f"- [{d.get('step_id')}.{d.get('field_id')}] {d.get('value')} ({d.get('source')})" + (f" — {d.get('reason')}" if d.get("reason") else "")
            for d in decisions
        )
    return "\n".join(sections)


def draft_artifact(
    *,
    artifact_type: str,
    artifact_title: str,
    mission_title: str,
    step_titles: dict[str, str],
    answers: dict[str, Any],
    decisions: list[dict[str, Any]],
    router: LLMRouter | None = None,
    api_key: str | None = None,
    user_model_choice: str | None = None,
) -> tuple[dict[str, Any], bool, dict[str, Any]]:
    """One staged, substantive LLM call per artifact type -- each gets the
    mission's FULL answer context (every step, not just the ones nominally
    "about" this artifact) plus an explicit instruction to complement gaps,
    clearly marked, never silently. Returns a draft (no id/generated_at --
    those are assigned on confirm, once the user has actually reviewed and
    accepted this content), a degraded flag, and real call metadata (provider/
    model/token usage actually reported by the router -- used by callers that
    want to show a live "current activity" panel without inventing anything)."""
    context_body = _compile_body(artifact_title, step_titles, answers, decisions)
    router = router or LLMRouter()
    response = router.route(
        LLMRequest(
            system=DRAFT_SYSTEM_PROMPT.format(artifact_title=artifact_title, mission_title=mission_title, artifact_type=artifact_type),
            user=f"<mission_context>\n{context_body}\n</mission_context>",
            reasoning=ReasoningLevel.medium,
            max_output_tokens=4000,
        ),
        user_choice=user_model_choice,
        agent_role="mission_artifact_draft",
        api_key=api_key,
    )
    degraded = response.served_by_fallback or not response.text.strip()
    content = (
        f"# {artifact_title}\n\n_Modo degradado: nenhum LLM real respondeu -- o "
        "conteúdo abaixo é o registro bruto das respostas, sem elaboração ou "
        f"complemento da IA._\n\n{context_body}" if degraded else response.text.strip()
    )
    meta = {
        "provider": getattr(response.provider, "value", str(response.provider)),
        "model": response.model,
        "input_tokens": int(response.usage.get("input_tokens", 0) or 0),
        "output_tokens": int(response.usage.get("output_tokens", 0) or 0),
    }
    return {"type": artifact_type, "title": artifact_title, "content": content, "format": "markdown"}, degraded, meta
