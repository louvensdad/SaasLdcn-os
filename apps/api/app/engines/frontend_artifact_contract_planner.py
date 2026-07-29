from __future__ import annotations

import re
from typing import Any

from app.schemas.architecture_manifest import ArchitectureManifest
from app.schemas.frontend_artifact_contract import FrontendArtifactContract, FrontendRouteContract


class FrontendArtifactContractPlanner:
    def plan(
        self,
        spec: Any,
        blueprint: dict[str, Any] | None,
        architecture_manifest: ArchitectureManifest,
    ) -> FrontendArtifactContract:
        blueprint = blueprint or {}
        framework = self._frontend_choice(blueprint) or "Next.js"
        is_next = "next" in framework.lower()
        frontend_root = "apps/web"
        app_root = f"{frontend_root}/src"
        route_root = f"{app_root}/app" if is_next else f"{app_root}/pages"
        auth = self._requires_auth(spec, blueprint)

        routes = [
            FrontendRouteContract(path="/", pageArtifact=f"{route_root}/page.tsx"),
            FrontendRouteContract(path="/dashboard", pageArtifact=f"{route_root}/dashboard/page.tsx", protected=auth),
        ]
        if auth:
            routes.extend([
                FrontendRouteContract(path="/login", pageArtifact=f"{route_root}/login/page.tsx"),
                FrontendRouteContract(path="/register", pageArtifact=f"{route_root}/register/page.tsx"),
            ])
        for entity in list(getattr(spec, "entities", []) or [])[:8]:
            slug = self._slug(entity)
            route = f"/{slug}"
            artifact = f"{route_root}/{slug}/page.tsx"
            if route not in {item.path for item in routes}:
                routes.append(FrontendRouteContract(path=route, pageArtifact=artifact, protected=auth))

        api_client = f"{app_root}/lib/api/client.ts"
        auth_artifacts = []
        stores = []
        services = []
        components = [f"{app_root}/components/ui/ErrorBoundary.tsx"]
        if auth:
            stores = [f"{app_root}/stores/authStore.ts"]
            services = [f"{app_root}/services/authService.ts"]
            auth_artifacts = [
                *stores,
                *services,
                api_client,
                f"{route_root}/login/page.tsx",
                f"{route_root}/register/page.tsx",
                f"{app_root}/components/auth/AuthGuard.tsx",
                f"{app_root}/mocks/handlers/auth.ts",
            ]
            components.append(f"{app_root}/components/auth/AuthGuard.tsx")

        required_dependencies = {
            "next": "^14.0.0",
            "react": "^18.0.0",
            "react-dom": "^18.0.0",
            "react-error-boundary": "^4.0.0",
        }
        if auth:
            required_dependencies["zustand"] = "^4.0.0"
        required_dev = {
            "typescript": "^5.0.0",
            "vitest": "^2.0.0",
            "@testing-library/react": "^16.0.0",
            "@testing-library/jest-dom": "^6.0.0",
            "msw": "^2.0.0",
        }
        return FrontendArtifactContract(
            frontendRoot=frontend_root,
            framework=framework,
            language="TypeScript",
            packageManager="npm",
            entrypoint=f"{route_root}/layout.tsx" if is_next else f"{app_root}/main.tsx",
            applicationRoot=app_root,
            routes=routes,
            requiredPages=[route.pageArtifact for route in routes],
            requiredLayouts=[f"{route_root}/layout.tsx"],
            requiredComponents=components,
            requiredStores=stores,
            requiredServices=services,
            apiClient=api_client,
            authenticationArtifacts=auth_artifacts,
            testFramework="vitest",
            testRoots=[f"{app_root}/tests", f"{app_root}/__tests__"],
            mockFramework="msw",
            requiredDependencies=required_dependencies,
            requiredDevDependencies=required_dev,
            forbiddenRoots=["frontend", "src/frontend", "web"],
            forbiddenDuplicateArtifacts=[
                "authStore.ts", "authService.ts", "client.ts", "AuthGuard.tsx",
                "layout.tsx", "package.json", "tsconfig.json",
            ],
            buildCommand="npm run build",
            typeCheckCommand="npm run type-check",
            lintCommand="npm run lint",
            testCommand="npm test -- --run",
            startCommand="npm run dev",
        )

    @staticmethod
    def prompt_block(contract: FrontendArtifactContract) -> str:
        routes = "\n".join(f"- {item.path} -> {item.pageArtifact}" for item in contract.routes)
        required = "\n".join(f"- {path}" for path in FrontendArtifactContractPlanner.required_artifacts(contract))
        return (
            "<frontend_artifact_contract>\n"
            "CONTRATO DETERMINISTICO E BLOQUEANTE DO FRONTEND:\n"
            f"root={contract.frontendRoot}; framework={contract.framework}; language={contract.language}\n"
            f"entrypoint={contract.entrypoint}; packageManager={contract.packageManager}\n"
            f"Rotas:\n{routes}\nArtefatos obrigatorios:\n{required}\n"
            "Nao importe arquivo fora deste contrato sem cria-lo no mesmo lote. "
            "Todo pacote importado deve estar no package.json na secao correta. "
            "Nao crie roots, stores, services, clients, pages, layouts ou mocks concorrentes.\n"
            "</frontend_artifact_contract>"
        )

    @staticmethod
    def required_artifacts(contract: FrontendArtifactContract) -> list[str]:
        return list(dict.fromkeys([
            contract.entrypoint,
            *contract.requiredPages,
            *contract.requiredLayouts,
            *contract.requiredComponents,
            *contract.requiredStores,
            *contract.requiredServices,
            contract.apiClient,
            *contract.authenticationArtifacts,
            f"{contract.frontendRoot}/package.json",
            f"{contract.frontendRoot}/tsconfig.json",
            f"{contract.frontendRoot}/vitest.config.ts",
        ]))

    @staticmethod
    def _requires_auth(spec: Any, blueprint: dict[str, Any]) -> bool:
        text = " ".join([
            str(getattr(spec, "raw_intent", "")),
            *map(str, getattr(spec, "business_rules", []) or []),
            *map(str, getattr(spec, "core_workflows", []) or []),
            str(blueprint),
        ]).lower()
        return any(token in text for token in ("auth", "login", "registro", "register", "sessao", "session", "jwt", "oauth"))

    @staticmethod
    def _frontend_choice(blueprint: dict[str, Any]) -> str:
        for decision in blueprint.get("decisions") or []:
            if isinstance(decision, dict) and str(decision.get("area", "")).lower() == "frontend":
                return str(decision.get("choice") or "")
        return ""

    @staticmethod
    def _slug(value: str) -> str:
        words = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", value)
        return re.sub(r"[^a-z0-9]+", "-", words.lower()).strip("-") or "items"


frontend_artifact_contract_planner = FrontendArtifactContractPlanner()
