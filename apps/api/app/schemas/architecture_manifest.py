from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

# Output of ArchitectureConsolidationGate (app.engines.architecture_consolidation_gate),
# which runs *before* the final write in GenerationJobEngine._build() -- a
# preventive gate, not a post-failure repair. See PARTE 4 of the request.

ConflictKind = Literal["duplicate_basename", "competing_root", "multiple_entrypoints", "manifest_violation"]


class RejectedAlternative(ApiModel):
    basename: str
    path: str
    reason: str


class ConflictResolved(ApiModel):
    kind: ConflictKind
    description: str
    canonicalPath: str
    rejectedPaths: list[str] = Field(default_factory=list)


class ArchitectureManifest(ApiModel):
    phase: Literal["planned", "observed"] = "observed"
    planned: bool = False
    canonicalRoot: str = ""
    sourceRoot: str = ""
    entrypoint: str | None = None
    dependencyFile: str | None = None
    testRoot: str | None = None
    architectureStyle: str = "unknown"
    backendLanguage: str = ""
    backendFramework: str = ""
    allowedRoots: list[str] = Field(default_factory=list)
    forbiddenRoots: list[str] = Field(default_factory=list)
    observedRoots: list[str] = Field(default_factory=list)
    conformsToPlan: bool = True
    canonicalFiles: dict[str, str] = Field(default_factory=dict)
    rejectedAlternatives: list[RejectedAlternative] = Field(default_factory=list)
    conflictsResolved: list[ConflictResolved] = Field(default_factory=list)
    # Signals a conflict this gate could not safely auto-resolve (e.g. two
    # genuinely different entrypoint files, not just the same file at two
    # paths). Deliberately does NOT halt the pipeline by itself in this phase
    # -- the blast radius of a false positive here is every future job, so
    # the integration treats this as a prominent warning, not a hard stop,
    # until validated against more real-world generations.
    blocked: bool = False
    blockReason: str = ""
