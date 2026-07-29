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

# For duplicate DETECTION only (not the canonical-pick preference above):
# longest-prefix-first so "backend/app/" strips before the bare "backend/"
# fallback would. Real bug found live: grouping by bare basename alone treated
# every module's own port.py/router.py/schemas.py (one per bounded context in
# a hexagonal/clean-architecture backend -- account/port.py, admin/port.py,
# auth/port.py, ... are legitimately DIFFERENT files that happen to share a
# filename by convention) as "6 competing duplicates of the same file", and
# the consolidation gate then discarded 5 of the 6 real modules' code. Two
# paths are only a true duplicate when they are the SAME logical file
# re-emitted under a different competing root prefix -- i.e. their residual
# path *after* stripping a known root prefix is identical.
_ROOT_STRIP_PREFIXES = ("backend/src/app/", "backend/app/", "src/app/", "app/", "backend/")


def normalize(path: str) -> str:
    return path.replace("\\", "/")


def basename_of(path: str) -> str:
    return normalize(path).rsplit("/", 1)[-1].lower()


def module_relative_path(path: str) -> str:
    """`path` with a leading known backend-root prefix stripped, if any
    matches -- the "logical identity" used to tell a true cross-root
    duplicate (app/x/y.py vs backend/app/x/y.py) apart from two genuinely
    different per-module files that merely share a basename
    (app/account/port.py vs app/admin/port.py)."""
    normalized = normalize(path)
    for prefix in _ROOT_STRIP_PREFIXES:
        if normalized.startswith(prefix):
            return normalized[len(prefix):]
    return normalized


def _is_role_named_file(path: str) -> bool:
    """True for the lowercase role/layer-name convention Python/JS/TS use for
    files that legitimately repeat once per module by architectural
    convention (port.py, router.py, schemas.py, models.py, service.py,
    repository.py -- confirmed live: account/port.py, admin/port.py,
    auth/port.py, ... are 6 genuinely different files, not 6 competing
    duplicates of one). False for the PascalCase/UpperCamelCase convention
    languages like Java/C#/Kotlin use for a *specific* domain entity or
    use-case class (Usuario.java, RegistrarUsuarioUseCase.java) -- those DO
    need cross-package deduplication (confirmed against a real historical
    job where one domain entity was scattered across 6 packages by
    independent, uncoordinated agent runs). The stem's first letter is the
    deciding signal: a capitalized stem is a specific named class, not a
    generic repeating role."""
    raw_name = normalize(path).rsplit("/", 1)[-1]
    stem = raw_name.split(".", 1)[0]
    return not (stem and stem[0].isupper())


def duplicate_basenames(paths: list[str]) -> dict[str, list[str]]:
    """Group generated file paths that are the SAME logical file generated
    more than once; return only groups with more than one distinct path.

    Two different grouping keys, chosen per path by `_is_role_named_file`:
    - A generic, lowercase per-module role file (port.py, router.py,
      schemas.py, models.py, ...) groups by its module-relative RESIDUAL path
      (root prefix stripped) -- so account/port.py and admin/port.py, which
      share a basename purely by architectural convention, are never treated
      as duplicates of each other; only the exact same module's file
      re-emitted under a different competing root prefix is.
    - A PascalCase-named file (Usuario.java, RegistrarUsuarioUseCase.java) --
      the convention for a *specific* domain entity/use-case class in
      languages like Java/C#/Kotlin -- groups by bare basename alone, since a
      real historical job scattered one such class across 6 differently-named
      packages with no shared residual at all; only the class name itself
      reliably ties those together.

    Excludes filenames a framework convention expects to legitimately repeat
    regardless of any of the above (page.tsx, __init__.py, ...)."""
    by_key: dict[str, set[str]] = defaultdict(set)
    for path in paths:
        if not path:
            continue
        if basename_of(path) in CONVENTIONAL_REPEATED_BASENAMES:
            continue
        key = module_relative_path(path) if _is_role_named_file(path) else basename_of(path)
        by_key[key].add(normalize(path))
    return {key: sorted(group) for key, group in by_key.items() if len(group) > 1}


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
