from __future__ import annotations

import concurrent.futures as cf
import logging
import random
import time
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field

from app.engines.agent_executor import submit_agent
from app.engines.agent_prompts import system_prompt_for
from app.engines.context_pack_builder import (
    budget_for,
    build_agent_context,
    compress_to_budget,
    estimate_tokens,
    is_payload_too_large,
    summarize_contract,
)
from app.engines.llm.base import LLMError
from app.engines.llm.router import LLMRouter
from app.repositories.redaction import redact_text
from app.schemas.llm import LLMRequest, LLMResponse, ReasoningLevel
from app.services.file_protocol import ParsedAgentOutput, parse_agent_output

logger = logging.getLogger("ldcn.meta_factory")

# Complete API-First role catalog. Execution remains delivery-type aware so the
# legacy streaming route does not add mobile work to existing web projects.
PIPELINE_ORDER = ["contracts", "backend", "frontend", "mobile", "qa", "devops", "docs"]


def pipeline_order_for(delivery_type: str | None) -> list[str]:
    if delivery_type in {"mobile", "full_stack"}:
        return PIPELINE_ORDER
    return [role for role in PIPELINE_ORDER if role != "mobile"]

# Each agent is a single blocking LLM call that emits nothing until it returns.
# We run it on a worker thread and emit a heartbeat every few seconds so the SSE
# stream keeps producing bytes — that is the ONLY true "backend is alive" signal
# the UI has during a multi-minute generation. A per-agent hard timeout bounds a
# genuine hang so the worker thread can never block the pipeline forever.
HEARTBEAT_EVERY_S = 8.0
AGENT_TIMEOUT_MS = 360_000  # 6 min — deep agents are slow, but never infinite


@dataclass
class AgentRun:
    role: str
    model: str
    response: LLMResponse
    parsed: ParsedAgentOutput


@dataclass
class PipelineResult:
    runs: list[AgentRun] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


# Per-role reasoning depth and output budget. Backend and frontend carry the most
# code, so they get the deepest reasoning and the largest budgets; backend goes
# "max" (ultra-deep) because Clean Architecture + traceability + OWASP is the
# hardest single agent. 48k stays under every model cap in the registry
# (sonnet/haiku 64k, opus 128k, gemini flash ~65k) while leaving room for thinking.
_ROLE_EFFORT: dict[str, tuple[ReasoningLevel, int]] = {
    "contracts": (ReasoningLevel.high, 24_000),
    "backend": (ReasoningLevel.max, 48_000),
    "frontend": (ReasoningLevel.max, 40_000),
    "mobile": (ReasoningLevel.max, 40_000),
    "qa": (ReasoningLevel.high, 32_000),
    "devops": (ReasoningLevel.medium, 20_000),
    "docs": (ReasoningLevel.high, 20_000),
    "repair": (ReasoningLevel.max, 48_000),
}


def _agent_request(system: str, user: str, role: str) -> LLMRequest:
    effort, max_tokens = _ROLE_EFFORT.get(role, (ReasoningLevel.high, 32_000))
    return LLMRequest(
        system=system,
        user=user,
        reasoning=effort,
        cache_prefix=True,
        max_output_tokens=max_tokens,
        timeout_ms=AGENT_TIMEOUT_MS,
    )


_MAX_AGENT_ATTEMPTS = 3

# Exponential backoff + jitter before an agent RETRY, so N attempts don't hammer the
# provider in an instant thundering herd (audit AI4). Kept small; the per-request
# timeout still bounds the overall stage.
_RETRY_BACKOFF_BASE_S = 0.6
_RETRY_BACKOFF_MAX_S = 8.0
_RETRY_JITTER_S = 0.4


def _retry_sleep(attempt: int) -> None:
    """Sleep before agent attempt N (N>=2): exponential backoff with jitter."""
    delay = min(_RETRY_BACKOFF_MAX_S, _RETRY_BACKOFF_BASE_S * (2 ** (attempt - 2)))
    time.sleep(delay + random.uniform(0, _RETRY_JITTER_S))

# Appended to the context on a retry when the previous reply produced no files,
# nudging the model back onto the exact protocol. The tolerant parser already
# recovers markdown/JSON/XML, so this is a last resort, not the first line.
_CORRECTION_SUFFIX = (
    "\n\n[CORRECAO DE FORMATO] A resposta anterior nao pode ser convertida em arquivos. "
    "Reenvie EXCLUSIVAMENTE no protocolo, repetindo para CADA arquivo:\n"
    '<<<FILE path="caminho/relativo.ext">>>\n'
    "<conteudo integral do arquivo>\n"
    "<<<END>>>\n"
    "Sem markdown e sem explicacoes — apenas os blocos FILE."
)


_MINIMAL_OUTPUT_SUFFIX = (
    "\n\n[MODO PARTICIONADO MINIMO] Gere somente o menor conjunto de arquivos desta parte. "
    "Nao repita contexto, justificativas ou arquivos anteriores. Use apenas blocos <<<FILE>>> validos."
)


def _run_agent(
    router: LLMRouter,
    role: str,
    context: str,
    user_model_choice: str | None,
    api_key: str | None,
    language: str | None = None,
    framework: str | None = None,
) -> tuple[LLMResponse, ParsedAgentOutput]:
    """Route one agent call and parse it with the tolerant parser.

    Resilience layers (every attempt logged with measured payload size):
    - **Budget guard**: the context is compressed to the role budget BEFORE the
      first send, so an Enterprise project can never push a giant single request.
    - **413 / partitioned retry**: if the provider still says "payload too large",
      the context is compressed harder and the call re-tried — the pipeline never
      dies on a 413.
    - **Format retry**: an empty/unparseable reply is re-prompted with a format
      correction (up to 3 attempts total).
    Runs on a worker thread so the pipeline can emit heartbeats while it blocks."""
    attempts: list[dict] = []
    response: LLMResponse | None = None
    parsed = ParsedAgentOutput()

    budget = budget_for(role)
    working, guard_steps = compress_to_budget(context, budget)
    partitioned = False
    if guard_steps:
        attempts.append({
            "attempt": 0, "model": user_model_choice or "—", "latency_ms": 0,
            "payload_chars": len(context), "estimated_tokens": estimate_tokens(context),
            "ok": True, "event": "budget_guard",
            "reason": f"Contexto comprimido de {len(context)} para {len(working)} chars (budget {budget}); passos: {', '.join(guard_steps)}.",
        })

    correction = False
    attempt = 0
    while attempt < _MAX_AGENT_ATTEMPTS:
        attempt += 1
        if attempt >= 2:
            _retry_sleep(attempt)  # backoff + jitter before every retry (audit AI4)
        if attempt == 2:
            working, _ = compress_to_budget(working, max(3_000, int(budget * 0.72)))
            correction = True
        elif attempt == 3:
            working, _ = compress_to_budget(working, max(2_000, int(budget * 0.45)))
            correction = True
            partitioned = True
        prompt_context = working + (_CORRECTION_SUFFIX if correction else "")
        if attempt == 3:
            prompt_context += _MINIMAL_OUTPUT_SUFFIX
        payload_chars = len(prompt_context)
        started = time.perf_counter()
        try:
            response = router.route(
                _agent_request(system_prompt_for(role, language, framework), prompt_context, role),
                user_choice=user_model_choice,
                agent_role=role,
                api_key=api_key,
            )
        except Exception as exc:  # noqa: BLE001 — never lose the reason
            if isinstance(exc, LLMError) and is_payload_too_large(exc):
                # 413 → partitioned fallback: shrink hard and retry (does not count
                # as a "no-files" attempt failure; it is a payload problem).
                partitioned = True
                tighter = max(2_000, int(len(working) * 0.55))
                working, steps = compress_to_budget(working, tighter)
                attempts.append({
                    "attempt": attempt, "model": user_model_choice or "—",
                    "latency_ms": int((time.perf_counter() - started) * 1000),
                    "payload_chars": payload_chars, "estimated_tokens": estimate_tokens(prompt_context),
                    "ok": False, "partitioned": True, "event": "payload_too_large",
                    "reason": f"413 payload grande demais; recomprimido para {len(working)} chars ({', '.join(steps) or 'truncate'}).",
                })
                continue
            # A real provider/agent error (timeout, auth, 4xx/5xx, schema, …).
            # RECORD it (attempt + reason) instead of re-raising and losing the
            # diagnostics — the stage still fails, but now with a visible cause.
            # Redact first: provider SDK errors can embed request headers/URLs with
            # API keys or Bearer tokens (audit S3), and this reason is logged.
            reason = redact_text(f"{type(exc).__name__}: {exc}")
            attempts.append({
                "attempt": attempt, "model": user_model_choice or "—",
                "latency_ms": int((time.perf_counter() - started) * 1000),
                "payload_chars": payload_chars, "estimated_tokens": estimate_tokens(prompt_context),
                "ok": False, "event": "llm_error", "reason": reason[:400],
            })
            if attempt < _MAX_AGENT_ATTEMPTS:
                correction = True
                continue
            parsed = ParsedAgentOutput()
            parsed.attempts = attempts
            parsed.partitioned = partitioned
            parsed.errors.append(f"{role} falhou: {reason[:300]}")
            return None, parsed  # type: ignore[return-value]
        parsed = parse_agent_output(response.text, agent_role=role)
        attempts.append({
            "attempt": attempt,
            "model": response.model,
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "payload_chars": payload_chars,
            "estimated_tokens": estimate_tokens(prompt_context),
            "tokens": dict(response.usage),
            "parser_strategy": parsed.parser_strategy,
            "parser_confidence": round(parsed.parser_confidence, 2),
            "file_count": len(parsed.files),
            "ok": bool(parsed.files),
            "partitioned": partitioned,
            "stopped_by": response.stopped_by,
            "reason": "" if parsed.files else (parsed.errors[0] if parsed.errors else "sem arquivos extraidos"),
        })
        if parsed.files:
            if attempt > 1 or partitioned:
                parsed.warnings.append(
                    f"Recuperado na tentativa {attempt}/{_MAX_AGENT_ATTEMPTS}"
                    + (" (modo particionado por payload)" if partitioned else "")
                    + "."
                )
            break
        correction = True

    parsed.attempts = attempts
    parsed.partitioned = partitioned
    return response, parsed  # type: ignore[return-value]


_LANG_BY_EXT = {
    ".py": "python", ".java": "java", ".ts": "typescript", ".tsx": "typescript",
    ".js": "javascript", ".jsx": "javascript", ".json": "json", ".yaml": "yaml",
    ".yml": "yaml", ".md": "markdown", ".sql": "sql", ".sh": "shell", ".env": "dotenv",
}


def _language_for(path: str) -> str:
    lower = path.lower()
    if "dockerfile" in lower:
        return "dockerfile"
    for ext, lang in _LANG_BY_EXT.items():
        if lower.endswith(ext):
            return lang
    return "text"


def iter_single_agent(
    router: LLMRouter | None,
    role: str,
    context: str,
    *,
    user_model_choice: str | None = None,
    api_key: str | None = None,
    pack_diagnostics: dict | None = None,
    language: str | None = None,
    framework: str | None = None,
) -> Iterator[dict]:
    """Run one factory agent and yield progress events plus a result sentinel."""
    router = router or LLMRouter()
    yield {"type": "agent_started", "role": role}

    response: LLMResponse | None = None
    # Shared, bounded pool (audit B5): no per-call executor to spawn/tear down. On
    # hard timeout we stop waiting and best-effort cancel; a running worker is bounded
    # by the adapter's own request timeout, and the global pool caps total workers.
    future = submit_agent(_run_agent, router, role, context, user_model_choice, api_key, language, framework)
    started = time.monotonic()
    deadline = started + AGENT_TIMEOUT_MS / 1000
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            future.cancel()
            parsed = ParsedAgentOutput()
            parsed.errors.append(
                f"{role} excedeu o tempo limite de {AGENT_TIMEOUT_MS // 1000}s e foi abortado."
            )
            break
        try:
            response, parsed = future.result(timeout=min(HEARTBEAT_EVERY_S, remaining))
            break
        except cf.TimeoutError:
            yield {
                "type": "heartbeat",
                "role": role,
                "elapsed_ms": int((time.monotonic() - started) * 1000),
            }
        except Exception as exc:  # agent failed: provider error, timeout, ...
            parsed = ParsedAgentOutput()
            parsed.errors.append(redact_text(f"{role} falhou: {exc}"))
            break

    for emitted in parsed.files:
        yield {
            "type": "file_emitted",
            "role": role,
            "path": emitted.path,
            "language": _language_for(emitted.path),
        }

    if parsed.errors:
        detail = "; ".join(parsed.errors)
    elif parsed.warnings:
        detail = f"{len(parsed.files)} arquivo(s) · " + "; ".join(parsed.warnings)
    else:
        detail = f"{len(parsed.files)} arquivos válidos no território do agente."
    yield {
        "type": "gate_check",
        "role": role,
        "check": "protocol_and_territory",
        "status": "passed" if parsed.ok else "failed",
        "detail": detail,
    }

    last = parsed.attempts[-1] if parsed.attempts else {}
    # When run standalone (no upstream pack diagnostics), synthesize a minimal one
    # from the measured send so the payload size/budget are always observable.
    context_pack = pack_diagnostics or {
        "role": role,
        "chars": last.get("payload_chars", len(context)),
        "estimated_tokens": last.get("estimated_tokens", estimate_tokens(context)),
        "budget_chars": budget_for(role),
    }
    yield {
        "type": "agent_finished",
        "role": role,
        "model": response.model if response is not None else (user_model_choice or "—"),
        "stopped_by": response.stopped_by if response is not None else "error",
        "degraded": response.served_by_fallback if response is not None else False,
        "file_count": len(parsed.files),
        "errors": list(parsed.errors),
        "warnings": list(parsed.warnings),
        # Resilience diagnostics: which parser strategy won, its confidence, and
        # the full per-attempt log — so a format difference is transparent.
        "parser_strategy": parsed.parser_strategy,
        "parser_confidence": round(parsed.parser_confidence, 2),
        "attempts": list(parsed.attempts),
        "diagnostics": parsed.diagnostics(),
        # Payload / context-pack diagnostics (413 resilience): size, budget,
        # sections kept, whether a partitioned retry happened.
        "partitioned": parsed.partitioned,
        "context_pack": context_pack,
    }
    # Server-side log: agent, payload size/tokens, pack, attempts, retry, fallback,
    # and — crucially — the failure reason when a stage produced no files.
    fail_reason = "" if parsed.files else (last.get("reason") or (parsed.errors[0] if parsed.errors else ""))
    logger.info(
        "meta_factory.agent role=%s files=%d payload_chars=%s est_tokens=%s pack_chars=%s "
        "attempts=%d partitioned=%s parser=%s reason=%r",
        role, len(parsed.files), last.get("payload_chars"), last.get("estimated_tokens"),
        context_pack.get("chars"), len(parsed.attempts), parsed.partitioned,
        parsed.parser_strategy, fail_reason,
    )
    yield {"type": "result", "role": role, "parsed": parsed, "response": response}


def iter_factory_pipeline(
    mega_prompt: str,
    *,
    router: LLMRouter | None = None,
    user_model_choice: str | None = None,
    api_key: str | None = None,
    delivery_type: str | None = None,
    language: str | None = None,
    framework: str | None = None,
) -> Iterator[dict]:
    """Run the API-First agent chain, yielding progress events as they happen.

    The contract emitted by the Contracts agent is appended to the shared context
    so Back/Front/QA/DevOps/Docs build against the same source of truth. The stable
    agent `system` prefix is cacheable across the run (PASSO 3.4).

    Event shapes (each dict carries a "type"):
      - {"type":"agent_started","role":..}
      - {"type":"file_emitted","role":..,"path":..,"language":..}
      - {"type":"gate_check","role":..,"check":..,"status":"passed"|"failed","detail":..}
      - {"type":"agent_finished","role":..,"model":..,"stopped_by":..,"degraded":bool,
         "file_count":int,"errors":[..]}
      - {"type":"result","result": PipelineResult}  # terminal sentinel; not for the wire
    """
    router = router or LLMRouter()
    result = PipelineResult()
    contract_summary = ""
    emitted_so_far: list[str] = []

    for role in pipeline_order_for(delivery_type):
        # Per-agent Context Pack: only the role's sections + relevant blueprint
        # areas + a SUMMARY of the contract (never the full raw bodies) + the
        # emitted-file list. Built within the role's budget so a complex project
        # can never push a giant single request → no more HTTP 413.
        context, pack_diag = build_agent_context(
            role,
            mega_prompt,
            contract_summary=contract_summary,
            emitted_files=tuple(emitted_so_far),
        )

        parsed: ParsedAgentOutput | None = None
        response: LLMResponse | None = None
        for event in iter_single_agent(
            router,
            role,
            context,
            user_model_choice=user_model_choice,
            api_key=api_key,
            pack_diagnostics=pack_diag.as_dict(),
            language=language,
            framework=framework,
        ):
            if event.get("type") == "result":
                parsed = event["parsed"]
                response = event["response"]
                continue
            yield event

        if parsed is None:
            parsed = ParsedAgentOutput()
            parsed.errors.append(f"{role} falhou: pipeline produced no result")
        if response is not None:
            result.runs.append(AgentRun(role=role, model=response.model, response=response, parsed=parsed))

        if parsed.errors:
            result.errors.extend(f"[{role}] {e}" for e in parsed.errors)
        result.warnings.extend(f"[{role}] {w}" for w in parsed.warnings)

        if role == "contracts" and parsed.ok and parsed.files and response is not None:
            # Store a COMPACT summary (endpoints + schema names), never the full
            # raw response — this is what used to balloon the Backend payload to 413.
            contract_summary = summarize_contract(response.text)
        emitted_so_far.extend(f.path for f in parsed.files)

    yield {"type": "result", "result": result}


def run_factory_pipeline(
    mega_prompt: str,
    *,
    router: LLMRouter | None = None,
    user_model_choice: str | None = None,
    api_key: str | None = None,
    delivery_type: str | None = None,
    language: str | None = None,
    framework: str | None = None,
    on_event: Callable[[dict], None] | None = None,
) -> PipelineResult:
    """Run the API-First agent chain to completion.

    Thin wrapper over ``iter_factory_pipeline``: if ``on_event`` is supplied, each
    progress event is delivered to it as it occurs (the streaming route uses the
    iterator directly; the synchronous route uses this).
    """
    result = PipelineResult()
    for event in iter_factory_pipeline(
        mega_prompt, router=router, user_model_choice=user_model_choice, api_key=api_key,
        delivery_type=delivery_type, language=language, framework=framework,
    ):
        if event.get("type") == "result":
            result = event["result"]
        elif on_event is not None:
            on_event(event)
    return result
