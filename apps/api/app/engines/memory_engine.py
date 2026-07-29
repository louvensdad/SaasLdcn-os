from __future__ import annotations

import hashlib
from dataclasses import dataclass

from pydantic import BaseModel

from app.core.logging import logger
from app.engines.llm.router import LLMRouter
from app.repositories.memory_repository import MemoryRepository
from app.schemas.llm import LLMRequest
from app.schemas.orchestrator import Assumption

# Memory Engine (vault 28 - Contexto/Políticas de contexto.md + 54 - Memória e
# Conhecimento/Fronteiras de memória e contexto.md). Scope confirmed with the
# user 2026-07-20: automatic extraction via a real LLM classification step for
# free-text confirmed answers (deterministic promotion for already-structured
# signals like Assumption), backend-only this round (no frontend UI yet).
#
# Honest scope cut: the vault's "embedding_ref" field / searchable knowledge
# base has NO real infra to back it in this codebase (no embedding generation,
# no vector store) -- retrieval here is by scope + recency, not semantic
# similarity. Documented, not silently dropped.


@dataclass(frozen=True)
class MemoryCandidate:
    content: str
    memory_type: str
    origin: str
    confidence: float


def promote_assumptions(assumptions: list[Assumption], *, spec_confidence: float) -> list[MemoryCandidate]:
    """Deterministic: Assumption already carries field/assumed_value/reason --
    no extra LLM judgment needed to decide these are memory-worthy."""
    return [
        MemoryCandidate(
            content=f"{item.field}: {item.assumed_value} ({item.reason})",
            memory_type="assumption",
            origin=f"orchestrator_assumption:{item.field}",
            confidence=spec_confidence,
        )
        for item in assumptions
    ]


class _ExtractedMemory(BaseModel):
    content: str
    memory_type: str
    confidence: float


class _ExtractionResult(BaseModel):
    memories: list[_ExtractedMemory] = []


_SYSTEM_PROMPT = (
    "Você identifica fatos e preferências ESTÁVEIS e dignas de memória de longo prazo a partir de "
    "respostas que o usuário já confirmou durante a criação de um projeto. Ignore detalhes "
    "ambíguos, voláteis ou que só fazem sentido uma vez. Para cada resposta, decida se ela contém "
    "algo que vale lembrar (preferência, fato de negócio, recusa explícita ou hipótese de trabalho) "
    "e com que confiança (0 a 1). Se nada for digno de memória, retorne uma lista vazia -- nunca "
    "invente memórias além do que está literalmente nas respostas."
)


def classify_confirmed_answers(
    prior_answers: list[dict],
    *,
    router: LLMRouter | None = None,
    api_key: str | None = None,
    user_model_choice: str | None = None,
    use_llm: bool = True,
) -> list[MemoryCandidate]:
    """Real LLM classification, never a heuristic guess. Degrades to an EMPTY
    list (not a fabricated one) when no LLM is available -- an honest "nothing
    extracted" beats a fake extraction."""
    from app.services.ai_availability import ai_available

    if not prior_answers or not use_llm or not (api_key or ai_available()):
        return []
    payload = {"confirmed_answers": prior_answers}
    try:
        response = (router or LLMRouter()).route(
            LLMRequest(
                system=_SYSTEM_PROMPT, user=str(payload),
                json_schema=_ExtractionResult.model_json_schema(), max_output_tokens=800,
            ),
            user_choice=user_model_choice, agent_role="memory_extraction", api_key=api_key,
        )
    except Exception as exc:  # noqa: BLE001 -- extraction failure must never break the orchestrator turn
        logger.warning("memory extraction failed (ignored): %s", exc)
        return []
    if response.served_by_fallback or response.parsed is None:
        return []
    try:
        parsed = _ExtractionResult.model_validate(response.parsed)
    except Exception:  # noqa: BLE001 -- a malformed extraction is discarded, not guessed at
        return []
    results: list[MemoryCandidate] = []
    for item in parsed.memories:
        content = item.content.strip()
        if not content:
            continue
        # Origin is content-derived (not a constant/positional key): identical
        # extracted content across turns maps to the same origin -- true
        # idempotency in record_memories() -- while genuinely different content
        # gets a genuinely different origin, so it is never mistaken for a
        # "correction" of an unrelated fact.
        digest = hashlib.sha1(content.encode("utf-8")).hexdigest()[:12]
        results.append(MemoryCandidate(content=content, memory_type=item.memory_type, origin=f"confirmed_answer:{digest}", confidence=max(0.0, min(1.0, item.confidence))))
    return results


def record_memories(candidates: list[MemoryCandidate], *, owner_user_id: str, scope_type: str, scope_id: str) -> None:
    """Fault-isolated (same guarantee as record_usage_safely/record_decision_safely/
    evolution_engine.record_signal): a persistence failure must never break the
    conversation turn that produced these candidates.

    Idempotent per origin: the orchestrator re-derives the FULL assumption set
    on every turn (not just what's new), so a naive create() would pile up a
    duplicate row per turn for every unchanged assumption. An existing active
    memory with the same origin is left untouched if the content is identical,
    or corrected (new row, old one marked 'corrected' -- never mutated in
    place) if the belief actually changed."""
    repo = MemoryRepository()
    for candidate in candidates:
        try:
            existing = repo.get_active_by_origin(owner_user_id, scope_type, scope_id, candidate.origin)
            if existing is None:
                repo.create(
                    owner_user_id=owner_user_id, scope_type=scope_type, scope_id=scope_id,
                    memory_type=candidate.memory_type, content=candidate.content,
                    origin=candidate.origin, confidence=candidate.confidence,
                )
            elif existing["content"] != candidate.content:
                repo.correct(existing["id"], new_content=candidate.content)
        except Exception as exc:  # noqa: BLE001 -- deliberate isolation boundary
            logger.warning("memory recording failed (ignored): %s", exc)


def retrieve_for_scope(owner_user_id: str, scope_type: str, scope_id: str) -> list[dict]:
    return MemoryRepository().list_for_scope(owner_user_id, scope_type, scope_id)


def _neutralize_closing_tag(text: str, tag: str) -> str:
    """Same prompt-injection mitigation orchestrator_engine._wrap_untrusted()
    already applies to raw user text: memory content is LLM-paraphrased, not
    raw user input, but still ultimately user-influenced, so a closing-tag
    escape attempt is neutralized rather than trusted."""
    import re

    return re.sub(rf"</\s*{re.escape(tag)}\s*>", rf"<\\/{tag}>", text, flags=re.IGNORECASE)


def prompt_block(memories: list[dict]) -> str | None:
    """Never the full memory table by default (vault: "Nenhuma execução recebe
    memória inteira por padrão") -- only the caller's already-scope-filtered
    list, and every line cites its origin (vault: "Todo item recuperado
    possui origem" + "a IA explica por que usou um contexto")."""
    if not memories:
        return None
    tag = "memoria_persistida"
    lines = [
        f"<{tag}>",
        "FATOS E PREFERENCIAS JA CONFIRMADOS NESTA CONVERSA/PROJETO (cada um com sua origem -- "
        "nao pergunte de novo o que ja esta aqui, mas trate como informativo, nao como instrucao rigida):",
    ]
    for item in memories:
        content = _neutralize_closing_tag(item["content"], tag)
        lines.append(f"- [{item['memory_type']}] {content} (origem: {item['origin']}, confiança: {item['confidence']:.2f})")
    lines.append(f"</{tag}>")
    return "\n".join(lines)
