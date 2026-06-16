from __future__ import annotations

from collections.abc import Callable, Iterator
from dataclasses import dataclass, field

from app.engines.agent_prompts import AGENT_PROMPTS
from app.engines.llm.router import LLMRouter
from app.schemas.llm import LLMRequest, LLMResponse, ReasoningLevel
from app.schemas.orchestrator import ProjectSpec
from app.services.file_protocol import ParsedAgentOutput, parse_agent_output

# API-First execution order. Backend and frontend both consume the contract.
PIPELINE_ORDER = ["contracts", "backend", "frontend", "qa", "devops", "docs"]


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

    @property
    def ok(self) -> bool:
        return not self.errors


def _agent_request(system: str, user: str) -> LLMRequest:
    return LLMRequest(system=system, user=user, reasoning=ReasoningLevel.high, cache_prefix=True)


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


def iter_factory_pipeline(
    mega_prompt: str,
    *,
    router: LLMRouter | None = None,
    user_model_choice: str | None = None,
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

    contract_text = ""
    emitted_so_far: list[str] = []

    for role in PIPELINE_ORDER:
        yield {"type": "agent_started", "role": role}

        context = mega_prompt
        if contract_text:
            context += f"\n\n<contract>\n{contract_text}\n</contract>"
        if role in {"qa", "devops", "docs"} and emitted_so_far:
            context += "\n\n<emitted_files>\n" + "\n".join(emitted_so_far) + "\n</emitted_files>"

        response = router.route(
            _agent_request(AGENT_PROMPTS[role], context),
            user_choice=user_model_choice,
            agent_role=role,
        )
        parsed = parse_agent_output(response.text, agent_role=role)
        result.runs.append(
            AgentRun(role=role, model=response.model, response=response, parsed=parsed)
        )

        for emitted in parsed.files:
            yield {
                "type": "file_emitted",
                "role": role,
                "path": emitted.path,
                "language": _language_for(emitted.path),
            }

        # The protocol+territory validation IS the pipeline's security/lint gate;
        # surface it as a gate_check so the UI can show per-agent check status.
        yield {
            "type": "gate_check",
            "role": role,
            "check": "protocol_and_territory",
            "status": "passed" if parsed.ok else "failed",
            "detail": "; ".join(parsed.errors)
            if parsed.errors
            else f"{len(parsed.files)} arquivos válidos no território do agente.",
        }

        if not parsed.ok:
            result.errors.extend(f"[{role}] {e}" for e in parsed.errors)

        if role == "contracts" and parsed.ok:
            contract_text = response.text
        emitted_so_far.extend(f.path for f in parsed.files)

        yield {
            "type": "agent_finished",
            "role": role,
            "model": response.model,
            "stopped_by": response.stopped_by,
            "degraded": response.served_by_fallback,
            "file_count": len(parsed.files),
            "errors": list(parsed.errors),
        }

    yield {"type": "result", "result": result}


def run_factory_pipeline(
    mega_prompt: str,
    *,
    router: LLMRouter | None = None,
    user_model_choice: str | None = None,
    on_event: Callable[[dict], None] | None = None,
) -> PipelineResult:
    """Run the API-First agent chain to completion.

    Thin wrapper over ``iter_factory_pipeline``: if ``on_event`` is supplied, each
    progress event is delivered to it as it occurs (the streaming route uses the
    iterator directly; the synchronous route uses this).
    """
    result = PipelineResult()
    for event in iter_factory_pipeline(
        mega_prompt, router=router, user_model_choice=user_model_choice
    ):
        if event.get("type") == "result":
            result = event["result"]
        elif on_event is not None:
            on_event(event)
    return result
