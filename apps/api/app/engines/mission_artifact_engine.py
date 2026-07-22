from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.engines.llm.router import LLMRouter
from app.schemas.llm import LLMRequest, ReasoningLevel

SUMMARY_SYSTEM_PROMPT = (
    "Você é um redator técnico. Dado o conteúdo estruturado abaixo (dentro de "
    "<artifact_body>) de um artefato \"{artifact_title}\" gerado pela missão "
    "\"{mission_title}\", escreva um único parágrafo de resumo executivo (3 a 5 "
    "frases), em português. Responda apenas com o parágrafo, sem título e sem markdown."
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


def compile_artifact(
    *,
    artifact_type: str,
    artifact_title: str,
    mission_title: str,
    step_titles: dict[str, str],
    answers: dict[str, Any],
    decisions: list[dict[str, Any]],
    can_feed_mission: list[str],
    router: LLMRouter | None = None,
    api_key: str | None = None,
    user_model_choice: str | None = None,
) -> tuple[dict[str, Any], bool]:
    """Deterministic compiler (always produces a real artifact from captured
    answers) plus an optional LLM executive-summary paragraph prepended at the
    top. Returns (MissionArtifact-shaped dict, degraded)."""
    body = _compile_body(artifact_title, step_titles, answers, decisions)
    router = router or LLMRouter()
    response = router.route(
        LLMRequest(
            system=SUMMARY_SYSTEM_PROMPT.format(artifact_title=artifact_title, mission_title=mission_title),
            user=f"<artifact_body>\n{body}\n</artifact_body>",
            reasoning=ReasoningLevel.low,
            max_output_tokens=600,
        ),
        user_choice=user_model_choice,
        agent_role="mission_artifact_summary",
        api_key=api_key,
    )
    degraded = response.served_by_fallback or not response.text.strip()
    content = body if degraded else f"# {artifact_title}\n\n## Resumo executivo\n\n{response.text.strip()}\n\n" + "\n".join(body.splitlines()[2:])
    artifact = {
        "id": f"art_{uuid4().hex[:10]}",
        "type": artifact_type,
        "title": artifact_title,
        "content": content,
        "format": "markdown",
        "generated_at": datetime.now(UTC).replace(microsecond=0).isoformat(),
        "can_feed_mission": can_feed_mission,
    }
    return artifact, degraded
