from __future__ import annotations

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


def run_factory_pipeline(
    mega_prompt: str,
    *,
    router: LLMRouter | None = None,
    user_model_choice: str | None = None,
) -> PipelineResult:
    """Run the API-First agent chain over a compiled Mega-Prompt.

    The contract emitted by the Contracts agent is appended to the shared context
    so Back/Front/QA/DevOps/Docs build against the same source of truth. The
    stable agent `system` prefix is cacheable across the run (PASSO 3.4).
    """
    router = router or LLMRouter()
    result = PipelineResult()

    contract_text = ""
    emitted_so_far: list[str] = []

    for role in PIPELINE_ORDER:
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

        if not parsed.ok:
            result.errors.extend(f"[{role}] {e}" for e in parsed.errors)

        if role == "contracts" and parsed.ok:
            contract_text = response.text
        emitted_so_far.extend(f.path for f in parsed.files)

    return result
