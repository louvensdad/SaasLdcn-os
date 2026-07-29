from __future__ import annotations

from app.engines.architecture_manifest_planner import architecture_manifest_planner
from app.schemas.orchestrator import ProjectSpec, SuggestedStack


def _spec(language: str, framework: str) -> ProjectSpec:
    return ProjectSpec(
        raw_intent="Sistema auditavel",
        suggested_stack=SuggestedStack(
            language=language,
            framework=framework,
            architecture="clean_architecture",
        ),
    )


def test_python_manifest_is_fixed_before_generation():
    manifest = architecture_manifest_planner.plan(_spec("Python", "FastAPI"))
    assert manifest.phase == "planned"
    assert manifest.planned is True
    assert manifest.canonicalRoot == "backend/app"
    assert manifest.entrypoint == "backend/app/main.py"
    assert manifest.dependencyFile == "backend/requirements.txt"
    assert manifest.testRoot == "backend/tests"


def test_typescript_manifest_has_one_backend_root():
    manifest = architecture_manifest_planner.plan(_spec("TypeScript", "NestJS"))
    assert manifest.canonicalRoot == "backend/src"
    assert manifest.entrypoint == "backend/src/main.ts"
    assert manifest.dependencyFile == "backend/package.json"
    assert manifest.allowedRoots == ["backend/src", "backend/test"]


def test_manifest_prompt_forbids_competing_architecture():
    manifest = architecture_manifest_planner.plan(_spec("Python", "FastAPI"))
    prompt = architecture_manifest_planner.prompt_block(manifest)
    assert "backend root unico: backend/app" in prompt
    assert "Nao crie outra raiz backend" in prompt
