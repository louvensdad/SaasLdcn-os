from __future__ import annotations

import json
from typing import Any

from app.engines.agent_prompts import system_prompt_for
from app.engines.factory_pipeline import _agent_request
from app.engines.llm.router import LLMRouter
from app.schemas.auto_repair import RepairAction, RepairResult
from app.schemas.orchestrator import ProjectSpec
from app.schemas.quality_gate import QualityGateReport, QualityIssue
from app.services.file_protocol import parse_agent_output
from app.services.generated_project_service import GeneratedProjectService
from app.services.project_writer import ProjectWriteError, ProjectWriter

# LLM-driven Auto-Repair: the sibling of AutoRepairEngine for the class of QualityIssue
# the Quality Gate itself marks auto_fixable=False -- hardcoded secrets, path traversal,
# an unmapped failed check, a dependency conflict. AutoRepairEngine's deterministic
# template fixers simply `continue` past these (see quality_gate_engine._FAILED_CHECK_MAP /
# _FINDING_MAP: a None fix_id means "no template exists"), so today they sit unresolved
# forever unless a human edits the generated project by hand.
#
# This reuses the "repair" agent role/system prompt already proven by
# verification_engine's build-failure repair loop (same REPAIR_SYSTEM_PROMPT, same
# ReasoningLevel.max effort), but scoped per-QualityIssue: it hands the LLM the
# root_cause/suggested_fix the Quality Gate ALREADY computed plus the implicated file's
# real content, instead of re-deriving everything from a raw build log. A revalidate
# pass (quality_gate_engine.evaluate() again) is the real verifier of whether an issue
# is actually gone -- this engine only reports what it attempted, via RepairAction.

_FILE_CHAR_CAP = 12_000
_CONTEXT_CHAR_BUDGET = 40_000
# One LLM call covers at most this many issues, so a project with an unusually large
# BLOCKER backlog gets several bounded calls (never a silent drop of the remainder).
_ISSUES_PER_CALL = 8


def _repairable(report: QualityGateReport) -> list[QualityIssue]:
    """BLOCKER issues with no deterministic template and not already fixed.
    WARNING/INFO are left as-is -- LLM repair spend is reserved for what actually
    blocks release."""
    return [
        issue for issue in report.issues
        if issue.severity == "BLOCKER" and not issue.auto_fixable and issue.fix_status != "applied"
    ]


def _chunks(items: list[QualityIssue], size: int) -> list[list[QualityIssue]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


class LlmRepairEngine:
    def __init__(self, writer: ProjectWriter | None = None, files_service: GeneratedProjectService | None = None) -> None:
        self.writer = writer or ProjectWriter()
        self.files_service = files_service or GeneratedProjectService()

    def repairable_issues(self, report: QualityGateReport) -> list[QualityIssue]:
        return _repairable(report)

    def _context_for(self, project: dict[str, Any], spec: ProjectSpec, issues: list[QualityIssue]) -> str:
        snippets: list[dict[str, str]] = []
        total = 0
        seen_paths: set[str] = set()
        for issue in issues:
            if not issue.file or issue.file in seen_paths or total >= _CONTEXT_CHAR_BUDGET:
                continue
            seen_paths.add(issue.file)
            try:
                data = self.files_service.read_file(project, issue.file)
            except Exception:
                continue
            content = data.get("content")
            if not isinstance(content, str) or not content:
                continue
            text = content[: min(_FILE_CHAR_CAP, _CONTEXT_CHAR_BUDGET - total)]
            total += len(text)
            snippets.append({"path": issue.file, "content": text})

        payload = {
            "intent": spec.product_summary,
            "suggested_stack": spec.suggested_stack.model_dump(),
            "issues": [
                {
                    "id": issue.id, "title": issue.title, "file": issue.file,
                    "root_cause": issue.root_cause, "suggested_fix": issue.suggested_fix,
                }
                for issue in issues
            ],
            "implicated_files": snippets,
        }
        return (
            "O Quality Gate encontrou problema(s) BLOCKER que o reparo deterministico nao "
            "sabe corrigir (exigem entender o codigo, nao um arquivo-stub). Corrija a RAIZ de "
            "cada `issues[].root_cause` seguindo `issues[].suggested_fix`; reemita apenas os "
            "arquivos que mudam ou que faltam.\n\n" + json.dumps(payload, ensure_ascii=False, indent=2)
        )

    def _repair_batch(
        self, project: dict[str, Any], spec: ProjectSpec, issues: list[QualityIssue], *,
        router: LLMRouter, user_model_choice: str | None, api_key: str | None,
    ) -> list[RepairAction]:
        context = self._context_for(project, spec, issues)
        response = router.route(
            _agent_request(
                system_prompt_for("repair", spec.suggested_stack.language, spec.suggested_stack.framework),
                context, "repair",
            ),
            user_choice=user_model_choice, agent_role="repair", api_key=api_key,
            # Token Intelligence: the same BLOCKER batch re-requested with
            # identical context (e.g. /repair/llm called again with nothing
            # changed) is a genuine duplicate -- see router.py's docstring for
            # why this is opt-in rather than the router's default.
            allow_cache=True,
        )
        parsed = parse_agent_output(response.text, agent_role="repair")

        if not parsed.files:
            return [
                RepairAction(issue_id=issue.id, title=issue.title, status="skipped", detail="agente nao retornou arquivos", source="llm")
                for issue in issues
            ]
        try:
            self.writer.append(str(project["project_id"]), parsed.files, metadata={"llm_repaired": True})
        except ProjectWriteError as exc:
            return [
                RepairAction(issue_id=issue.id, title=issue.title, status="failed", detail=str(exc), source="llm")
                for issue in issues
            ]
        written = sorted({emitted.path for emitted in parsed.files})
        return [
            RepairAction(issue_id=issue.id, title=issue.title, status="applied", files_written=written, source="llm")
            for issue in issues
        ]

    def repair(
        self, project: dict[str, Any], report: QualityGateReport, spec: ProjectSpec, *,
        router: LLMRouter | None = None, user_model_choice: str | None = None, api_key: str | None = None,
    ) -> RepairResult:
        issues = _repairable(report)
        router = router or LLMRouter()
        actions: list[RepairAction] = []
        for batch in _chunks(issues, _ISSUES_PER_CALL):
            actions.extend(self._repair_batch(project, spec, batch, router=router, user_model_choice=user_model_choice, api_key=api_key))

        applied = [a for a in actions if a.status == "applied"]
        diff: list[str] = []
        for action in applied:
            diff += [f"+ {p}" for p in action.files_written]
        return RepairResult(
            project_id=str(project["project_id"]),
            actions=actions,
            applied_count=len(applied),
            failed_count=len([a for a in actions if a.status == "failed"]),
            skipped_count=len([a for a in actions if a.status == "skipped"]),
            diff_summary=diff,
        )


llm_repair_engine = LlmRepairEngine()
