from __future__ import annotations

import re
from collections import defaultdict

# Shared detection/heuristic primitives for backend architectural
# fragmentation -- "the same logical file generated at multiple competing
# paths" and "multiple competing source roots in one job". Used by BOTH the
# read-only diagnosis team (root_cause_investigator, post-hoc after a
# failure) and the preventive ArchitectureConsolidationGate (before the final
# write). Kept in one module so the two can never quietly disagree about what
# counts as a duplicate.

KNOWN_BACKEND_ROOT_PREFIXES = ("backend/app/", "backend/src/app/", "app/", "src/app/")

BACKEND_SOURCE_EXTENSIONS = {".py", ".java", ".go", ".rb", ".cs", ".php", ".rs", ".kt"}

# Filenames a real framework convention *expects* to repeat across many
# directories -- one per route/module -- and are therefore never evidence of
# duplication on their own (confirmed against a real 691-artifact job: naive
# basename grouping flagged "page.tsx" as "duplicated" across 10 paths, which
# was simply 10 different Next.js App Router pages, not a conflict).
CONVENTIONAL_REPEATED_BASENAMES = {
    "page.tsx", "page.ts", "page.jsx", "page.js", "layout.tsx", "layout.ts",
    "route.tsx", "route.ts", "loading.tsx", "error.tsx", "not-found.tsx",
    "template.tsx", "index.ts", "index.tsx", "index.js", "__init__.py",
}

ENTRYPOINT_PATTERNS = (
    re.compile(r"(?:^|/)main\.py$"),
    re.compile(r"(?:^|/)manage\.py$"),
    re.compile(r"(?:^|/)app\.py$"),
    re.compile(r"(?:^|/)[A-Za-z0-9_]*Application\.java$"),
    re.compile(r"(?:^|/)main\.go$"),
    re.compile(r"(?:^|/)(?:index|server)\.(?:js|ts)$"),
    re.compile(r"(?:^|/)Program\.cs$"),
)

# Canonical preference order for picking one file among duplicates. Biased
# toward the FastAPI/hexagonal-architecture layout this pipeline's BACKEND_
# SYSTEM_PROMPT targets by default; for stacks that don't match any prefix
# (e.g. a Java/Spring project, as confirmed against real job data), falls
# back to the longest path -- deterministic, but a plain heuristic, not a
# language-aware architectural judgement. Good enough to stop duplication;
# not a substitute for a per-language canonical-layout policy.
_CANONICAL_PREFERENCE_ORDER = ("backend/app/", "app/", "backend/src/app/", "src/app/")


def normalize(path: str) -> str:
    return path.replace("\\", "/")


def basename_of(path: str) -> str:
    return normalize(path).rsplit("/", 1)[-1].lower()


def duplicate_basenames(paths: list[str]) -> dict[str, list[str]]:
    """Group generated file paths by basename; return only basenames that
    appear at more than one distinct path, excluding filenames a framework
    convention expects to legitimately repeat."""
    by_basename: dict[str, set[str]] = defaultdict(set)
    for path in paths:
        if not path:
            continue
        name = basename_of(path)
        if name in CONVENTIONAL_REPEATED_BASENAMES:
            continue
        by_basename[name].add(normalize(path))
    return {name: sorted(group) for name, group in by_basename.items() if len(group) > 1}


def competing_backend_roots(paths: list[str]) -> list[str]:
    """Backend source files (by extension) spanning more than one of the
    known competing root prefixes in the same file set."""
    seen: set[str] = set()
    for path in paths:
        name = normalize(path)
        base = name.rsplit("/", 1)[-1]
        if "." not in base:
            continue
        extension = "." + base.rsplit(".", 1)[-1].lower()
        if extension not in BACKEND_SOURCE_EXTENSIONS:
            continue
        for prefix in KNOWN_BACKEND_ROOT_PREFIXES:
            if name.startswith(prefix):
                seen.add(prefix.rstrip("/"))
                break
    return sorted(seen) if len(seen) > 1 else []


def pick_canonical(paths: list[str]) -> str:
    """Deterministic canonical pick among a group of candidate paths."""
    for prefix in _CANONICAL_PREFERENCE_ORDER:
        for path in paths:
            if path.startswith(prefix):
                return path
    return sorted(paths, key=len, reverse=True)[0]


def detect_entrypoints(paths: list[str]) -> list[str]:
    matches = {normalize(path) for path in paths if any(pattern.search(normalize(path)) for pattern in ENTRYPOINT_PATTERNS)}
    return sorted(matches)
