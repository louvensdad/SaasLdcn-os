from __future__ import annotations

from pydantic import Field

from app.schemas.common import ApiModel

# Project Manifest (Engineering Employee Mode, section 20): a single, real file
# written into every generated project with identity/stack/modules/decisions/
# evidence-file pointers in one place, instead of that information being
# scattered across the ProjectSpec/ArchitectureBlueprint (only ever passed to
# LLM agents, never persisted) and the live Engineering Kernel (Phase 2, an API
# response, not a file).


class ProjectManifestStack(ApiModel):
    language: str = ""
    framework: str = ""
    architecture: str = ""
    runtime: str = ""


class ProjectManifestModules(ApiModel):
    delivery_type: str = "web"
    entities: list[str] = Field(default_factory=list)
    core_workflows: list[str] = Field(default_factory=list)


class ProjectManifestDecision(ApiModel):
    area: str
    choice: str


class ProjectManifest(ApiModel):
    project_id: str
    project_name: str
    stack: ProjectManifestStack
    modules: ProjectManifestModules
    decisions: list[ProjectManifestDecision] = Field(default_factory=list)
    # Filenames this pipeline is known to produce -- NOT a live availability
    # check (that's the Engineering Kernel's Evidence Store, Phase 2). A static
    # manifest claiming live availability would go stale the moment a
    # human-review/override action changes state after generation.
    evidence_files: list[str] = Field(default_factory=list)
    generated_at: str
