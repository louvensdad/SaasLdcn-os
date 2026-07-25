"""Context Pack Builder — bounded, deduplicated, per-agent context.

The Meta-Factory used to send the SAME giant Mega-Prompt to every agent and, on
top of that, append the **entire raw Contracts response** (all FILE blocks with
the full OpenAPI/DTO bodies) to Backend/Frontend/QA/DevOps/Docs. For an Enterprise
project that single request blew past provider size limits → HTTP 413 and a dead
pipeline.

This module makes each agent receive only what it needs:
- only the Mega-Prompt sections relevant to its role,
- the Architecture Blueprint filtered to the areas it owns,
- a **summary** of the contract (endpoint signatures + schema names), never the
  full bodies,
- everything deduplicated and compressed to fit a per-role character budget.

Nothing here calls an LLM; it is pure text shaping, so it is fast and testable.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# Safe per-role budgets (characters). ~4 chars/token keeps every role well under
# provider context windows even after the agent's own system prompt + reasoning.
ROLE_BUDGET_CHARS: dict[str, int] = {
    "contracts": 60_000,
    "backend": 52_000,
    "frontend": 48_000,
    "mobile": 48_000,
    "qa": 44_000,
    "devops": 32_000,
    "docs": 40_000,
    "security": 36_000,
    "repair": 52_000,
    # Frontend Team (PARTE 6): planning-only roles need less than a full code
    # generation call; qa_review's real signal comes from the generated
    # artifacts injected separately (generation_job_engine.py), not from the
    # mega-prompt, so it also stays below "frontend"'s own budget.
    "frontend_ux_strategy": 32_000,
    "frontend_visual_direction": 28_000,
    "frontend_architecture_role": 40_000,
    "frontend_interaction_design": 32_000,
    "frontend_qa_review": 36_000,
}
DEFAULT_BUDGET_CHARS = 48_000

# Mega-Prompt "## section" titles each role actually needs. None ⇒ keep all.
# The leading "# PROJECT SPECIFICATION" header and Intent/Summary/Stack/Locale are
# always kept (shared backbone).
_ALWAYS = {"Intent", "System type (vertical)", "Summary", "Suggested stack",
           "Localization rules (NON-NEGOTIABLE)", "Business rules (priority zero)"}
ROLE_SECTIONS: dict[str, set[str] | None] = {
    "contracts": _ALWAYS | {"Target users", "Entities", "Core workflows", "Non-functional", "Assumptions (resolved silently-missing fields)"},
    "backend": _ALWAYS | {"Entities", "Core workflows", "Non-functional", "Assumptions (resolved silently-missing fields)"},
    "frontend": _ALWAYS | {"Target users", "Core workflows"},
    "mobile": _ALWAYS | {"Target users", "Core workflows"},
    "qa": _ALWAYS | {"Core workflows", "Entities"},
    "devops": _ALWAYS | {"Non-functional"},
    "docs": None,
    "security": _ALWAYS | {"Non-functional", "Entities"},
    "frontend_ux_strategy": _ALWAYS | {"Target users", "Core workflows"},
    "frontend_visual_direction": _ALWAYS | {"Target users"},
    "frontend_architecture_role": _ALWAYS | {"Target users", "Core workflows", "Entities"},
    "frontend_interaction_design": _ALWAYS | {"Target users", "Core workflows"},
    "frontend_qa_review": _ALWAYS | {"Core workflows", "Entities"},
}

# Blueprint decision areas each role owns (others are dropped to save payload).
ROLE_BLUEPRINT_AREAS: dict[str, set[str]] = {
    "contracts": {"apis", "backend", "database", "auth", "authorization"},
    "backend": {"backend", "database", "auth", "authorization", "apis", "integrations", "observability"},
    "frontend": {"frontend", "apis", "auth"},
    "mobile": {"mobile", "frontend", "apis", "auth"},
    "qa": {"tests", "apis", "backend"},
    "devops": {"deploy", "observability"},
    "docs": {"frontend", "backend", "database", "apis", "auth", "deploy"},
    "security": {"auth", "authorization", "apis", "integrations", "database"},
    "frontend_ux_strategy": {"frontend", "apis", "auth"},
    "frontend_visual_direction": {"frontend", "apis", "auth"},
    "frontend_architecture_role": {"frontend", "apis", "auth"},
    "frontend_interaction_design": {"frontend", "apis", "auth"},
    "frontend_qa_review": {"frontend", "apis", "auth"},
}

_BLUEPRINT_TITLE = "Architecture Blueprint"
_SECTION_RE = re.compile(r"^## (?P<title>.+?)\s*$", re.MULTILINE)


@dataclass
class ContextPackDiagnostics:
    role: str
    chars: int = 0
    estimated_tokens: int = 0
    budget_chars: int = 0
    sections_kept: list[str] = field(default_factory=list)
    blueprint_areas: list[str] = field(default_factory=list)
    contract_summarized: bool = False
    compressed: bool = False
    compression_steps: list[str] = field(default_factory=list)
    over_budget: bool = False

    def as_dict(self) -> dict:
        return {
            "role": self.role,
            "chars": self.chars,
            "estimated_tokens": self.estimated_tokens,
            "budget_chars": self.budget_chars,
            "sections_kept": self.sections_kept,
            "blueprint_areas": self.blueprint_areas,
            "contract_summarized": self.contract_summarized,
            "compressed": self.compressed,
            "compression_steps": self.compression_steps,
            "over_budget": self.over_budget,
        }


_TOO_LARGE_HINTS = (
    "413", "payload too large", "request entity too large", "too large",
    "context length", "maximum context", "context_length_exceeded",
    "prompt is too long", "string too long", "reduce the length",
    "input is too long", "exceeds the maximum",
)


def is_payload_too_large(exc: BaseException) -> bool:
    """Classify a provider error as a 'payload too large' / context-overflow case,
    across providers (413, OpenAI 'maximum context length', Anthropic 'prompt is
    too long', …) without importing any SDK."""
    status = getattr(exc, "status_code", None) or getattr(getattr(exc, "response", None), "status_code", None)
    if status == 413:
        return True
    message = str(getattr(exc, "message", "") or exc).lower()
    return any(hint in message for hint in _TOO_LARGE_HINTS)


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def budget_for(role: str) -> int:
    return ROLE_BUDGET_CHARS.get(role, DEFAULT_BUDGET_CHARS)


# --------------------------------------------------------------------------- #
# Section selection
# --------------------------------------------------------------------------- #

def _split_sections(mega: str) -> tuple[str, list[tuple[str, str]]]:
    """Return (preamble, [(title, body), …]) split on '## ' headers."""
    matches = list(_SECTION_RE.finditer(mega))
    if not matches:
        return mega, []
    preamble = mega[: matches[0].start()].rstrip()
    sections: list[tuple[str, str]] = []
    for i, match in enumerate(matches):
        title = match.group("title").strip()
        body_start = match.end()
        body_end = matches[i + 1].start() if i + 1 < len(matches) else len(mega)
        sections.append((title, mega[body_start:body_end].rstrip()))
    return preamble, sections


def _filter_blueprint(title: str, body: str, role: str) -> str:
    """Keep only the blueprint decision lines for the role's owned areas."""
    if _BLUEPRINT_TITLE not in title:
        return body
    areas = ROLE_BLUEPRINT_AREAS.get(role)
    if not areas:
        return body
    kept = [
        line for line in body.splitlines()
        if not line.strip().startswith("- ")
        or line.strip().lstrip("- ").split(":", 1)[0].strip().lower() in areas
    ]
    return "\n".join(kept)


def select_sections(mega: str, role: str) -> tuple[str, list[str]]:
    """Trim the Mega-Prompt to the sections relevant for `role`."""
    preamble, sections = _split_sections(mega)
    wanted = ROLE_SECTIONS.get(role)
    kept_titles: list[str] = []
    out = [preamble] if preamble else []
    for title, body in sections:
        is_blueprint = _BLUEPRINT_TITLE in title
        if wanted is not None and not is_blueprint and title not in wanted:
            continue
        body = _filter_blueprint(title, body, role)
        if not body.strip():
            continue
        out.append(f"## {title}\n{body}")
        kept_titles.append(title)
    return "\n\n".join(out), kept_titles


# --------------------------------------------------------------------------- #
# Contract summarization (the single biggest payload contributor)
# --------------------------------------------------------------------------- #

_FILE_BLOCK_RE = re.compile(r'<<<FILE\s+path="(?P<path>[^"]+)">>>\r?\n(?P<body>.*?)\r?\n?<<<END>>>', re.DOTALL)
_ENDPOINT_RE = re.compile(r"^\s*(get|post|put|patch|delete|options|head):", re.IGNORECASE | re.MULTILINE)
_PATH_LINE_RE = re.compile(r"^\s*(/[\w{}/\-.:]+):\s*$", re.MULTILINE)
_SCHEMA_HINT_RE = re.compile(r"^\s*([A-Z][A-Za-z0-9_]+)\s*:", re.MULTILINE)


def summarize_contract(contract_response_text: str, *, max_chars: int = 8_000) -> str:
    """Turn the raw Contracts agent reply (full FILE blocks) into a compact map of
    endpoints + schema names + file paths. The downstream agents need the contract
    *shape*, not every byte of the OpenAPI body."""
    if not contract_response_text:
        return ""
    blocks = list(_FILE_BLOCK_RE.finditer(contract_response_text))
    if not blocks:
        # No protocol markers: fall back to a hard truncation of the raw text.
        text = contract_response_text.strip()
        return text if len(text) <= max_chars else text[:max_chars] + "\n… (contrato truncado)"

    lines: list[str] = ["## Contract summary (referência — peça detalhes só se precisar)"]
    for block in blocks:
        path = block.group("path").strip()
        body = block.group("body")
        lines.append(f"\n### {path}")
        paths = _PATH_LINE_RE.findall(body)
        methods = len(_ENDPOINT_RE.findall(body))
        schemas = sorted(set(_SCHEMA_HINT_RE.findall(body)))
        if paths:
            shown = paths[:40]
            lines.append("endpoints: " + ", ".join(shown) + (f" (+{len(paths) - len(shown)})" if len(paths) > len(shown) else ""))
        if methods:
            lines.append(f"operations: {methods}")
        if schemas:
            shown_s = schemas[:40]
            lines.append("schemas: " + ", ".join(shown_s) + (f" (+{len(schemas) - len(shown_s)})" if len(schemas) > len(shown_s) else ""))
        if not paths and not schemas:
            head = "\n".join(body.splitlines()[:12])
            lines.append(head)
    summary = "\n".join(lines)
    if len(summary) > max_chars:
        summary = summary[:max_chars] + "\n… (resumo do contrato truncado)"
    return summary


# --------------------------------------------------------------------------- #
# Dedupe + compression
# --------------------------------------------------------------------------- #

def dedupe(text: str) -> str:
    """Drop exact duplicate non-empty lines and collapse blank runs."""
    seen: set[str] = set()
    out: list[str] = []
    blank = False
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            if not blank:
                out.append("")
            blank = True
            continue
        blank = False
        # Only dedupe bullet/heading-ish repeats, never code-looking lines.
        key = stripped
        if stripped.startswith(("- ", "* ", "#")) and key in seen:
            continue
        seen.add(key)
        out.append(line)
    return "\n".join(out)


def _compress_bullet_lists(text: str, keep: int) -> str:
    """Cap long bullet runs at `keep`, summarizing the remainder as '+N more'."""
    out: list[str] = []
    run: list[str] = []

    def flush() -> None:
        if not run:
            return
        if len(run) > keep:
            out.extend(run[:keep])
            out.append(f"- … (+{len(run) - keep} itens omitidos para caber no orçamento; IDs/rastreabilidade preservados acima)")
        else:
            out.extend(run)
        run.clear()

    for line in text.splitlines():
        if line.lstrip().startswith(("- ", "* ")):
            run.append(line)
        else:
            flush()
            out.append(line)
    flush()
    return "\n".join(out)


def compress_to_budget(text: str, budget_chars: int) -> tuple[str, list[str]]:
    """Progressively shrink `text` to fit `budget_chars`. Returns (text, steps)."""
    steps: list[str] = []
    if len(text) <= budget_chars:
        return text, steps

    text = dedupe(text)
    steps.append("dedupe")
    if len(text) <= budget_chars:
        return text, steps

    for keep in (24, 12, 6):
        text = _compress_bullet_lists(text, keep)
        steps.append(f"cap_lists:{keep}")
        if len(text) <= budget_chars:
            return text, steps

    # Last resort: priority-aware truncation (audit AI3). Blindly truncating the head
    # can drop mandatory TAIL sections (Localization NON-NEGOTIABLE, Business rules,
    # Blueprint decisions). Instead keep the backbone + mandatory sections and drop
    # non-priority bodies first; only hard-truncate if the backbone alone overflows.
    text = _priority_truncate(text, budget_chars)
    steps.append("priority_truncate")
    return text, steps


def _priority_truncate(text: str, budget_chars: int) -> str:
    preamble, sections = _split_sections(text)

    def _is_priority(title: str) -> bool:
        return title in _ALWAYS or title.startswith(_BLUEPRINT_TITLE)

    def _block(title: str, body: str) -> str:
        return f"## {title}\n{body}".rstrip()

    parts: list[str] = []
    if preamble.strip():
        parts.append(preamble.rstrip())
    # 1) Mandatory backbone survives in full.
    parts.extend(_block(t, b) for t, b in sections if _is_priority(t))
    used = len("\n\n".join(parts))
    # 2) Fill remaining budget with non-priority sections; drop the body (keep a
    # labelled placeholder) once it no longer fits, so nothing silently vanishes.
    for title, body in sections:
        if _is_priority(title):
            continue
        block = _block(title, body)
        placeholder = f"## {title}\n… (omitido para respeitar o limite do agente)"
        candidate = block if used + len(block) + 2 <= budget_chars else placeholder
        if used + len(candidate) + 2 > budget_chars and candidate is placeholder:
            continue
        parts.append(candidate)
        used += len(candidate) + 2

    out = "\n\n".join(parts)
    # 3) Backbone alone still overflows: fall back to a head truncation.
    if len(out) > budget_chars:
        out = out[: max(0, budget_chars - 80)].rstrip() + "\n… (contexto truncado para respeitar o limite do agente)"
    return out


# Backend/mobile generation is chunked into many independent, stateless LLM
# calls (structure, domain_entities, controllers, services, repositories, ...).
# Each call otherwise has no idea what a PRIOR chunk already decided, so it
# re-derives its own file-layout convention from scratch — which is how the
# SAME microservice ends up written at three different path prefixes
# (root/, backend/, services/) with drifting names (appointment-service vs
# appointments-service) across chunks of one generation run.
_MODULE_MANIFEST_BASENAMES = (
    "pom.xml", "build.gradle", "build.gradle.kts", "go.mod", "Cargo.toml",
    "composer.json", "package.json",
)


def module_roots_from_emitted(emitted_files: tuple[str, ...]) -> tuple[str, ...]:
    """Directories of already-emitted backend module manifests (one per
    microservice), excluding the project root itself. Passed back into every
    later backend chunk so it reuses the SAME module paths instead of
    inventing a new prefix or a differently-spelled service name."""
    roots: set[str] = set()
    for path in emitted_files:
        normalized = path.replace("\\", "/").lstrip("/")
        basename = normalized.rsplit("/", 1)[-1]
        if basename not in _MODULE_MANIFEST_BASENAMES:
            continue
        parent = normalized.rsplit("/", 1)[0] if "/" in normalized else ""
        if parent:  # skip the root-level manifest — only nested modules matter
            roots.add(parent)
    return tuple(sorted(roots))


# --------------------------------------------------------------------------- #
# Public entry point
# --------------------------------------------------------------------------- #

def build_agent_context(
    role: str,
    mega_prompt: str,
    *,
    contract_summary: str = "",
    emitted_files: tuple[str, ...] = (),
    module_roots: tuple[str, ...] = (),
    budget_chars: int | None = None,
) -> tuple[str, ContextPackDiagnostics]:
    """Assemble a focused, deduped, budget-bounded context for one agent."""
    budget = budget_chars if budget_chars is not None else budget_for(role)
    selected, kept_titles = select_sections(mega_prompt, role)

    parts = [selected]
    if contract_summary and role in {
        "backend", "frontend", "mobile", "qa", "devops", "docs", "security",
        "frontend_ux_strategy", "frontend_visual_direction", "frontend_architecture_role",
        "frontend_interaction_design", "frontend_qa_review",
    }:
        parts.append(contract_summary)
    if emitted_files and role in {"qa", "devops", "docs"}:
        shown = list(emitted_files)[:60]
        block = "<emitted_files>\n" + "\n".join(shown)
        if len(emitted_files) > len(shown):
            block += f"\n… (+{len(emitted_files) - len(shown)} arquivos)"
        parts.append(block + "\n</emitted_files>")
    if module_roots and role in {"backend", "mobile"}:
        shown_roots = list(module_roots)[:40]
        block = (
            "<established_module_paths>\n"
            "Os modulos abaixo JA foram criados por um chunk anterior desta mesma geracao "
            "(cada um e a pasta de um pom.xml/build.gradle/go.mod/etc. real). Escreva os "
            "arquivos deste modulo usando EXATAMENTE um desses caminhos como raiz — nunca "
            "crie uma copia paralela sob outro prefixo (ex.: 'backend/' ou 'services/') "
            "nem renomeie o modulo (singular/plural, sinonimos etc.).\n"
            + "\n".join(shown_roots) + "\n</established_module_paths>"
        )
        parts.append(block)

    context = "\n\n".join(p for p in parts if p.strip())
    diag = ContextPackDiagnostics(
        role=role,
        budget_chars=budget,
        sections_kept=kept_titles,
        blueprint_areas=sorted(ROLE_BLUEPRINT_AREAS.get(role, set())),
        contract_summarized=bool(contract_summary),
    )

    if len(context) > budget:
        diag.over_budget = True
        context, steps = compress_to_budget(context, budget)
        diag.compressed = True
        diag.compression_steps = steps

    diag.chars = len(context)
    diag.estimated_tokens = estimate_tokens(context)
    return context, diag
