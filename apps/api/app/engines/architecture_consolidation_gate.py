from __future__ import annotations

from app.engines import architecture_analysis
from app.schemas.architecture_manifest import ArchitectureManifest, ConflictResolved, RejectedAlternative
from app.services.file_protocol import EmittedFile

# ArchitectureConsolidationGate: runs before the final write (see PARTE 4 of
# the request), not after a failure. Given the emitted file set for one
# build, it:
#   1. finds every logical file generated at more than one competing path
#      (the exact bug pattern reported: multiple auth_service.py, multiple
#      models.py, multiple requirements.txt -- confirmed for real against a
#      691-artifact historical job, where the domain entity Usuario.java
#      alone existed at 6 different competing package roots);
#   2. picks exactly one canonical path per duplicate group and drops the
#      rest -- so `backend/app`, `app`, and `backend/src/app` can never all
#      survive into the same published project;
#   3. records everything (kept, dropped, why) in an ArchitectureManifest,
#      persisted alongside the build so the decision is auditable, not silent;
#   4. detects (but does not guess a fix for) genuinely different entrypoint
#      files and competing source roots that duplicate-resolution alone
#      didn't clear -- surfaced as `blocked`/`blockReason` for a human, never
#      silently dropped.
#
# Every agent that emits backend files still emits into the SAME shared file
# set this gate consolidates -- it does not change how agents write, only
# what is allowed to reach the published project afterward.


def _extension_of(path: str) -> str:
    base = path.replace("\\", "/").rsplit("/", 1)[-1]
    return "." + base.rsplit(".", 1)[-1].lower() if "." in base else ""


class ArchitectureConsolidationGate:
    def consolidate(self, files: list[EmittedFile]) -> tuple[list[EmittedFile], ArchitectureManifest]:
        rejected_paths: set[str] = set()
        canonical_files: dict[str, str] = {}
        rejected_alternatives: list[RejectedAlternative] = []
        conflicts: list[ConflictResolved] = []

        paths = [f.path for f in files]
        duplicates = architecture_analysis.duplicate_basenames(paths)
        for basename, group in sorted(duplicates.items()):
            canonical = architecture_analysis.pick_canonical(group)
            canonical_files[basename] = canonical
            losers = [p for p in group if p != canonical]
            rejected_paths.update(losers)
            for loser in losers:
                rejected_alternatives.append(RejectedAlternative(
                    basename=basename, path=loser,
                    reason=f"Duplicate of canonical '{canonical}'; only one implementation per responsibility may reach the published project.",
                ))
            conflicts.append(ConflictResolved(
                kind="duplicate_basename",
                description=f"'{basename}' was generated at {len(group)} competing paths.",
                canonicalPath=canonical, rejectedPaths=losers,
            ))

        consolidated_files = [f for f in files if f.path not in rejected_paths]
        remaining_paths = [f.path for f in consolidated_files]

        competing_roots = architecture_analysis.competing_backend_roots(remaining_paths)
        if competing_roots:
            conflicts.append(ConflictResolved(
                kind="competing_root",
                description=(
                    f"Backend source still spans {len(competing_roots)} different root layouts after "
                    f"duplicate resolution ({', '.join(competing_roots)}) -- whole subtrees never shared "
                    "a basename, so no single-file pick can resolve this."
                ),
                canonicalPath="", rejectedPaths=[],
            ))

        entrypoints = architecture_analysis.detect_entrypoints(remaining_paths)
        entrypoint: str | None = None
        blocked = False
        block_reason = ""
        if len(entrypoints) == 1:
            entrypoint = entrypoints[0]
        elif len(entrypoints) > 1:
            # These survived duplicate-basename resolution, so they are
            # *different* filenames matching an entrypoint pattern (e.g. a
            # stray main.py alongside a real *Application.java) -- dropping
            # either one could delete a legitimately different service.
            # Never guessed; surfaced for a human instead.
            blocked = True
            block_reason = f"{len(entrypoints)} distinct entrypoint candidates found: {entrypoints}. Cannot safely pick one automatically."
            conflicts.append(ConflictResolved(
                kind="multiple_entrypoints", description=block_reason,
                canonicalPath="", rejectedPaths=entrypoints,
            ))

        # Restricted to backend-language files: a full-stack job's frontend
        # (Next.js "src/app/[locale]/...") also matches these bare prefixes,
        # which previously made canonicalRoot report the frontend's router
        # structure as the backend's canonical root (confirmed against a real
        # full-stack job's artifact set).
        backend_paths = [p for p in remaining_paths if _extension_of(p) in architecture_analysis.BACKEND_SOURCE_EXTENSIONS]
        canonical_root = ""
        for prefix in ("backend/app", "app", "backend/src/app", "src/app"):
            if any(p.startswith(prefix + "/") for p in backend_paths):
                canonical_root = prefix
                break

        dependency_basenames = {"requirements.txt", "pyproject.toml", "pom.xml", "build.gradle", "build.gradle.kts", "package.json", "cargo.toml", "go.mod"}
        dependency_candidates = [p for p in remaining_paths if architecture_analysis.basename_of(p) in dependency_basenames]
        dependency_file = architecture_analysis.pick_canonical(dependency_candidates) if dependency_candidates else None

        if not canonical_root and dependency_file:
            # A pure-backend layout that doesn't match any known prefix (e.g.
            # Maven's "backend/pom.xml" / "backend/src/main/java/...") still
            # has one strong, language-agnostic signal: the dependency file's
            # own top-level directory.
            parts = dependency_file.split("/")
            if len(parts) > 1:
                canonical_root = parts[0]

        test_root = next((p.rsplit("/", 1)[0] for p in remaining_paths if "/test/" in p or "/tests/" in p or p.startswith("tests/")), None)

        manifest = ArchitectureManifest(
            canonicalRoot=canonical_root,
            sourceRoot=canonical_root,
            entrypoint=entrypoint,
            dependencyFile=dependency_file,
            testRoot=test_root,
            architectureStyle="clean_architecture" if canonical_root else "unknown",
            canonicalFiles=canonical_files,
            rejectedAlternatives=rejected_alternatives,
            conflictsResolved=conflicts,
            blocked=blocked,
            blockReason=block_reason,
        )
        return consolidated_files, manifest


architecture_consolidation_gate = ArchitectureConsolidationGate()
