from __future__ import annotations

import re
from dataclasses import dataclass, field

# Warning policy for the resilient generation pipeline (Meta-Factory).
#
# The Backend stage used to stall because "valid file + N warning(s)" had no
# decision rule: the pipeline could neither clearly continue nor clearly stop.
# This module classifies every warning string into one of five severities and
# states the single rule the whole pipeline obeys:
#
#   info | warning            -> NON-blocking  (continue)
#   blocking_warning          -> blocking      (NEEDS_USER_ACTION)
#   error | critical          -> blocking      (NEEDS_USER_ACTION / FAILED)
#
# Common documentation, coverage, TODO, traceability, territory-drift and
# synthesized-manifest warnings are deliberately NON-blocking: a correct file
# that merely drifted from its monorepo territory, or a doc with TODOs, must
# never kill the generation. Only structural problems (no files, missing
# contract, build/compile failure) and security criticals block by default.

SEVERITY_ORDER = ("info", "warning", "blocking_warning", "error", "critical")
BLOCKING_LEVELS = frozenset({"blocking_warning", "error", "critical"})

# Ordered highest-severity-first; the first family that matches wins.
_CRITICAL_PATTERNS = (
    r"\bcritical\b",
    r"\bcr[íi]tic",
    r"hardcoded\s+(?:password|secret|token|api[\s_-]?key|credential)",
    r"\bsecret\s+(?:leak|exposed|in\s+code)",
    r"\bcredential[s]?\s+(?:exposed|leak|hardcoded)",
    r"\bvulnerab",
    r"\bsql\s*injection",
    r"\brce\b|\bremote\s+code\s+execution",
    r"\bsecurity\s+(?:risk|breach|hole)",
)
_ERROR_PATTERNS = (
    r"\berror\b",
    r"\berro\b",
    r"\bfatal\b",
    r"\bunrecoverable\b",
)
_BLOCKING_WARNING_PATTERNS = (
    r"no\s+file\s+blocks",
    r"nenhum\s+arquivo",
    r"sem\s+arquivos\s+v[áa]lidos",
    r"contrato.*ausente",
    r"openapi.*ausente",
    r"missing\s+.*contract",
    r"\bblocking\b",
    r"\bbloqueante\b",
    r"build\s+(?:local\s+)?falh",
    r"compile\s+error|erro\s+de\s+compila",
    r"syntax\s+error|sintaxe\s+inv[áa]lid",
    r"unresolved\s+import|import\s+n[ãa]o\s+resolvid",
)
# Recoverable, advisory signals — the generation continues.
_INFO_PATTERNS = (
    r"\btodo\b",
    r"recomenda|recommend",
    r"cobertura|coverage",
    r"document|traceabilit|rastreab",
    r"synthes|sintetiz|synthesized",
    r"\bmanifest\b",
    r"territory|territ[óo]rio",
    r"skipped|pulad[ao]",
    r"parser\s+tolerante|recuperad",
)


def _matches(text: str, patterns: tuple[str, ...]) -> bool:
    return any(re.search(pattern, text) for pattern in patterns)


def classify_one(warning: str) -> str:
    """Map a single warning string to one of SEVERITY_ORDER.

    Unknown warnings default to ``warning`` (non-blocking) — the pipeline favours
    progress over false blocks; genuinely dangerous signals must match an explicit
    blocking/critical pattern."""
    text = (warning or "").strip().lower()
    if not text:
        return "info"
    if _matches(text, _CRITICAL_PATTERNS):
        return "critical"
    if _matches(text, _BLOCKING_WARNING_PATTERNS):
        return "blocking_warning"
    if _matches(text, _INFO_PATTERNS):
        return "info"
    if _matches(text, _ERROR_PATTERNS):
        return "error"
    return "warning"


@dataclass
class WarningClassification:
    breakdown: dict[str, int] = field(default_factory=lambda: {level: 0 for level in SEVERITY_ORDER})
    blocking_messages: list[str] = field(default_factory=list)
    total: int = 0

    @property
    def blocking_count(self) -> int:
        return sum(self.breakdown[level] for level in BLOCKING_LEVELS)

    @property
    def warning_count(self) -> int:
        # Advisory volume the user sees ("116 warning(s)"): everything that is not
        # a hard error/critical. blocking_warning is counted here AND in blocking.
        return self.breakdown["info"] + self.breakdown["warning"] + self.breakdown["blocking_warning"]

    @property
    def error_count(self) -> int:
        return self.breakdown["error"] + self.breakdown["critical"]

    @property
    def blocking(self) -> bool:
        return self.blocking_count > 0

    def as_dict(self) -> dict:
        return {
            "breakdown": dict(self.breakdown),
            "blocking": self.blocking,
            "blocking_count": self.blocking_count,
            "warning_count": self.warning_count,
            "error_count": self.error_count,
            "total": self.total,
            "blocking_messages": list(self.blocking_messages),
        }


def classify(warnings: list[str] | tuple[str, ...]) -> WarningClassification:
    """Bucket a list of warning strings by severity and decide whether the set
    blocks the pipeline (any blocking_warning / error / critical)."""
    result = WarningClassification(total=len(warnings))
    for warning in warnings:
        level = classify_one(warning)
        result.breakdown[level] += 1
        if level in BLOCKING_LEVELS:
            result.blocking_messages.append(warning)
    return result
