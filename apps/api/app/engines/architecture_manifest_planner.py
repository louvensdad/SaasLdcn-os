from __future__ import annotations

from typing import Any

from app.schemas.architecture_manifest import ArchitectureManifest


class ArchitectureManifestPlanner:
    """Builds the immutable backend layout contract before any agent runs."""

    def plan(self, spec: Any) -> ArchitectureManifest:
        stack = getattr(spec, "suggested_stack", None)
        language = str(getattr(stack, "language", "") or "").strip().lower()
        framework = str(getattr(stack, "framework", "") or "").strip()
        architecture = str(getattr(stack, "architecture", "") or "clean_architecture").strip()

        canonical_root, entrypoint, dependency_file, test_root = self._layout(language, framework)
        competing = [
            root for root in ("app", "src/app", "backend/app", "backend/src/app", "backend/src")
            if root != canonical_root and not canonical_root.startswith(root + "/")
        ]
        return ArchitectureManifest(
            phase="planned",
            planned=True,
            canonicalRoot=canonical_root,
            sourceRoot=canonical_root,
            entrypoint=entrypoint,
            dependencyFile=dependency_file,
            testRoot=test_root,
            architectureStyle=architecture or "clean_architecture",
            backendLanguage=language,
            backendFramework=framework,
            allowedRoots=[canonical_root, test_root],
            forbiddenRoots=competing,
            conformsToPlan=True,
        )

    @staticmethod
    def prompt_block(manifest: ArchitectureManifest) -> str:
        return (
            "<architecture_manifest>\n"
            "CONTRATO DE ARQUITETURA IMUTAVEL (definido antes da geracao):\n"
            f"- backend root unico: {manifest.canonicalRoot}\n"
            f"- entrypoint unico: {manifest.entrypoint or 'definido pelo framework dentro da raiz canonica'}\n"
            f"- dependencias: {manifest.dependencyFile}\n"
            f"- testes: {manifest.testRoot}\n"
            f"- estilo: {manifest.architectureStyle}\n"
            "Nao crie outra raiz backend, outro entrypoint ou manifesto de dependencias concorrente.\n"
            "</architecture_manifest>"
        )

    @staticmethod
    def _layout(language: str, framework: str) -> tuple[str, str | None, str, str]:
        normalized = f"{language} {framework}".lower()
        if "python" in normalized or any(name in normalized for name in ("fastapi", "django", "flask")):
            return "backend/app", "backend/app/main.py", "backend/requirements.txt", "backend/tests"
        if "java" in normalized or "spring" in normalized:
            return "backend/src/main/java", None, "backend/pom.xml", "backend/src/test/java"
        if "go" == language or "golang" in normalized or " gin" in f" {normalized}":
            return "backend", "backend/cmd/api/main.go", "backend/go.mod", "backend/internal"
        if "rust" in normalized:
            return "backend/src", "backend/src/main.rs", "backend/Cargo.toml", "backend/tests"
        if any(name in normalized for name in ("typescript", "javascript", "node", "nestjs", "express")):
            return "backend/src", "backend/src/main.ts", "backend/package.json", "backend/test"
        return "backend/src", None, "backend/package.json", "backend/tests"


architecture_manifest_planner = ArchitectureManifestPlanner()
