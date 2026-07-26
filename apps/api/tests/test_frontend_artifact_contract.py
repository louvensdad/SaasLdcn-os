from __future__ import annotations

from app.engines.architecture_manifest_planner import architecture_manifest_planner
from app.engines.frontend_artifact_contract_planner import frontend_artifact_contract_planner
from app.schemas.orchestrator import ProjectSpec, SuggestedStack


def _spec(intent: str = "Aplicacao com login, registro e dashboard") -> ProjectSpec:
    return ProjectSpec(
        raw_intent=intent,
        entities=["Project"],
        suggested_stack=SuggestedStack(
            language="TypeScript",
            framework="Next.js",
            architecture="clean_architecture",
        ),
    )


def test_contract_is_planned_from_architecture_before_frontend_generation():
    spec = _spec()
    architecture = architecture_manifest_planner.plan(spec)
    contract = frontend_artifact_contract_planner.plan(
        spec,
        {"decisions": [{"area": "frontend", "choice": "Next.js"}]},
        architecture,
    )

    assert contract.planned is True
    assert contract.frontendRoot == "apps/web"
    assert contract.entrypoint == "apps/web/src/app/layout.tsx"
    assert contract.buildCommand == "npm run build"
    assert contract.typeCheckCommand == "npm run type-check"
    assert contract.testCommand == "npm test -- --run"


def test_auth_contract_declares_every_importable_auth_artifact():
    spec = _spec()
    contract = frontend_artifact_contract_planner.plan(
        spec, {}, architecture_manifest_planner.plan(spec),
    )

    required = set(frontend_artifact_contract_planner.required_artifacts(contract))
    assert {
        "apps/web/src/stores/authStore.ts",
        "apps/web/src/services/authService.ts",
        "apps/web/src/lib/api/client.ts",
        "apps/web/src/app/login/page.tsx",
        "apps/web/src/app/register/page.tsx",
        "apps/web/src/components/auth/AuthGuard.tsx",
        "apps/web/src/mocks/handlers/auth.ts",
    } <= required


def test_contract_prompt_is_suitable_for_every_frontend_related_agent():
    spec = _spec()
    contract = frontend_artifact_contract_planner.plan(
        spec, {}, architecture_manifest_planner.plan(spec),
    )
    prompt = frontend_artifact_contract_planner.prompt_block(contract)

    assert "<frontend_artifact_contract>" in prompt
    assert "Nao importe arquivo fora deste contrato sem cria-lo no mesmo lote" in prompt
    assert "/register -> apps/web/src/app/register/page.tsx" in prompt
