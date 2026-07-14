from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

# Project Memory (Production Guarantee Engine spec, section 5): a single,
# accumulating record of what THIS generation has already committed to --
# architecture, decisions, known problems, validated files -- read before
# every LLM step (via prompt_block) and updated after every successful stage
# validation. Closes the gap the audit found: `ldcn.project.json` only ever
# gets written once, after the job already reached READY, so nothing earlier
# in the pipeline could read it back. This file is instead persisted as a
# normal "generated" artifact at every successful stage, so it flows through
# the same ProjectWriter path as any other file and ships inside the
# generated project, growing across the whole run instead of only at the end.

PROJECT_MEMORY_FILE = ".ldcn/project-memory.json"

# Bounds on what actually goes into the LLM prompt block: the memory itself
# grows for the whole run, but the Smart Context Engine ask (spec section 6)
# is "the last relevant decision", not the entire history -- so only the most
# recent slice is ever injected, no matter how large the underlying log gets.
_MAX_DECISIONS_IN_PROMPT = 12
_MAX_KNOWN_PROBLEMS_IN_PROMPT = 8
_MAX_VALIDATED_FILES_IN_PROMPT = 20


@dataclass
class ProjectMemory:
    architecture: dict[str, str] = field(default_factory=dict)
    decisions: list[dict[str, str]] = field(default_factory=list)
    known_problems: list[str] = field(default_factory=list)
    validated_files: list[str] = field(default_factory=list)
    updated_at: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "architecture": self.architecture,
            "decisions": self.decisions,
            "known_problems": self.known_problems,
            "validated_files": self.validated_files,
            "updated_at": self.updated_at,
        }

    @staticmethod
    def from_dict(data: dict[str, Any] | None) -> "ProjectMemory":
        data = data or {}
        return ProjectMemory(
            architecture=dict(data.get("architecture") or {}),
            decisions=[dict(item) for item in data.get("decisions") or [] if isinstance(item, dict)],
            known_problems=list(data.get("known_problems") or []),
            validated_files=list(data.get("validated_files") or []),
            updated_at=str(data.get("updated_at") or ""),
        )


def _now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


class ProjectMemoryEngine:
    def build_initial(self, spec: Any, blueprint: dict[str, Any] | None) -> ProjectMemory:
        """The memory as of PREPARING_CONTEXT -- before any LLM step has run.
        Architecture + decisions come straight from the already-approved
        spec/blueprint (never re-derived later, so a later chunk can't quietly
        contradict them); known_problems/validated_files start empty and only
        grow from real pipeline events."""
        blueprint = blueprint or {}
        raw_decisions = blueprint.get("decisions") if isinstance(blueprint.get("decisions"), list) else []

        def _choice_for(area: str) -> str:
            for item in raw_decisions:
                if isinstance(item, dict) and str(item.get("area", "")).lower() == area:
                    return str(item.get("choice", ""))
            return ""

        stack = getattr(spec, "suggested_stack", None)
        backend = " ".join(
            part for part in (getattr(stack, "language", "") or "", getattr(stack, "framework", "") or "") if part
        ).strip()
        architecture = {
            "backend": backend,
            "database": _choice_for("database"),
            "frontend": _choice_for("frontend"),
        }
        decisions = [
            {
                "decision": ": ".join(part for part in (str(item.get("area", "")), str(item.get("choice", ""))) if part),
                "reason": str(item.get("justification") or item.get("reason") or ""),
            }
            for item in raw_decisions
            if isinstance(item, dict) and (item.get("area") or item.get("choice"))
        ]
        return ProjectMemory(architecture=architecture, decisions=decisions, known_problems=[], validated_files=[], updated_at=_now())

    def record_known_problem(self, memory: ProjectMemory, stage: str, message: str) -> None:
        entry = f"[{stage}] {message}".strip() if stage else message.strip()
        if entry and entry not in memory.known_problems:
            memory.known_problems.append(entry)
            memory.updated_at = _now()

    def record_validated_files(self, memory: ProjectMemory, filenames: list[str]) -> None:
        changed = False
        for name in filenames:
            if name and name not in memory.validated_files:
                memory.validated_files.append(name)
                changed = True
        if changed:
            memory.updated_at = _now()

    def prompt_block(self, memory: ProjectMemory) -> str:
        """Bounded summary injected into every LLM agent context. NOT the full
        growing log -- just the architecture already fixed plus the most
        recent decisions/known problems, so this can never become the thing
        that blows an agent's context budget."""
        lines = [
            "<project_memory>",
            "MEMORIA DO PROJETO (decisoes ja tomadas nesta geracao -- NAO redecida "
            "nem contradiga sem justificativa explicita):",
        ]
        arch_line = ", ".join(f"{key}: {value}" for key, value in memory.architecture.items() if value)
        if arch_line:
            lines.append(f"- Arquitetura ja fixada: {arch_line}")
        for item in memory.decisions[-_MAX_DECISIONS_IN_PROMPT:]:
            decision = item.get("decision", "")
            reason = item.get("reason", "")
            if not decision:
                continue
            lines.append(f"- Decisao: {decision}" + (f" ({reason})" if reason else ""))
        if memory.known_problems:
            lines.append("Problemas ja encontrados nesta geracao (evite reintroduzi-los):")
            for problem in memory.known_problems[-_MAX_KNOWN_PROBLEMS_IN_PROMPT:]:
                lines.append(f"- {problem}")
        if memory.validated_files:
            shown = memory.validated_files[-_MAX_VALIDATED_FILES_IN_PROMPT:]
            omitted = len(memory.validated_files) - len(shown)
            lines.append(
                f"Arquivos ja validados nesta geracao ({len(memory.validated_files)} total"
                + (f", mostrando os {len(shown)} mais recentes" if omitted > 0 else "")
                + "): " + ", ".join(shown)
            )
        lines.append("</project_memory>")
        return "\n".join(lines)


project_memory_engine = ProjectMemoryEngine()
