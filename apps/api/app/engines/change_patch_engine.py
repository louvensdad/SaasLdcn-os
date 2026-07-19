from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from app.engines.agent_prompts import system_prompt_for
from app.engines.factory_pipeline import _agent_request
from app.engines.llm.router import LLMRouter
from app.schemas.change_request import FileDiff
from app.services.diff_service import build_file_diffs
from app.services.file_protocol import EmittedFile, parse_agent_output

# Produces the actual patch for an Approved Change Request. Modeled on
# LlmRepairEngine's shape (LLM call -> parse_agent_output -> files) but with two
# mandatory steps LlmRepairEngine does not have, because a feature-ask patch is
# higher-risk than a build-failure repair:
#   1. SCOPE ENFORCEMENT -- any emitted path outside the frozen `scope` is
#      rejected, never applied, never silently dropped.
#   2. DIFFING -- a real content diff against the pre-fetched snapshot.
#
# Deliberately does NOT write to disk (unlike LlmRepairEngine.repair): the
# orchestrator must snapshot BEFORE any write happens, so writing here would
# make rollback-on-failure race the very write it's meant to protect against.

_FILE_CHAR_CAP = 12_000
_CONTEXT_CHAR_BUDGET = 40_000


@dataclass
class ChangePatchResult:
    accepted_files: list[EmittedFile] = field(default_factory=list)
    rejected_out_of_scope: list[str] = field(default_factory=list)
    diffs: list[FileDiff] = field(default_factory=list)
    manifest: dict[str, Any] = field(default_factory=dict)
    raw_errors: list[str] = field(default_factory=list)


class ChangePatchEngine:
    def _context_for(self, intent: str, scope: list[str], snapshot: dict[str, str | None]) -> str:
        snippets: list[dict[str, str]] = []
        total = 0
        for path in scope:
            content = snapshot.get(path)
            if content is None:
                snippets.append({"path": path, "content": "(arquivo novo, ainda nao existe)"})
                continue
            if total >= _CONTEXT_CHAR_BUDGET:
                continue
            text = content[: min(_FILE_CHAR_CAP, _CONTEXT_CHAR_BUDGET - total)]
            total += len(text)
            snippets.append({"path": path, "content": text})

        payload = {
            "intent": intent,
            "scope": scope,
            "current_files": snippets,
        }
        return (
            "Pedido de alteracao incremental do usuario sobre um projeto ja gerado. "
            "O `scope` abaixo e a lista EXAUSTIVA de caminhos permitidos -- nao emita "
            "nenhum arquivo fora dela. `current_files` traz o conteudo atual de cada "
            "caminho do escopo (ou aviso de que ainda nao existe).\n\n"
            + json.dumps(payload, ensure_ascii=False, indent=2)
        )

    def generate_patch(
        self,
        intent: str,
        scope: list[str],
        snapshot: dict[str, str | None],
        *,
        language: str | None = None,
        framework: str | None = None,
        router: LLMRouter | None = None,
        user_model_choice: str | None = None,
        api_key: str | None = None,
    ) -> ChangePatchResult:
        context = self._context_for(intent, scope, snapshot)
        response = (router or LLMRouter()).route(
            _agent_request(system_prompt_for("change_request", language, framework), context, "change_request"),
            user_choice=user_model_choice,
            agent_role="change_request",
            api_key=api_key,
        )
        parsed = parse_agent_output(response.text, agent_role="change_request")

        scope_set = set(scope)
        accepted: list[EmittedFile] = []
        rejected: list[str] = []
        for emitted in parsed.files:
            if emitted.path in scope_set:
                accepted.append(emitted)
            else:
                rejected.append(emitted.path)

        after = {emitted.path: emitted for emitted in accepted}
        diffs = build_file_diffs(snapshot, after)

        return ChangePatchResult(
            accepted_files=accepted,
            rejected_out_of_scope=rejected,
            diffs=diffs,
            manifest=parsed.manifest,
            raw_errors=list(parsed.errors),
        )
