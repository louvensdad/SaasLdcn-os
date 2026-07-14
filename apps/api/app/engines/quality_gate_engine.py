from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.engines.external_integration_audit_engine import external_integration_audit_engine
from app.engines.generated_project_quality_engine import GeneratedProjectQualityEngine
from app.engines.generation_validation_engine import generation_validation_engine
from app.schemas.quality_gate import QualityGateReport, QualityIssue


# The Quality Gate turns the raw quality/build signals into a professional,
# user-facing report: every problem becomes a QualityIssue with a severity
# (BLOCKER/WARNING/INFO), a root cause, a suggested fix and an `auto_fixable`
# flag the Auto-Repair engine dispatches on (via the stable `id`).
#
# Severity policy: anything that makes the project unsafe or non-functional
# (broken build, missing mandatory file, real secret/.env, path traversal,
# missing dependency) is a BLOCKER. Docs/coverage/quality nits are WARNING.

_SEVERITY_RANK: dict[str, int] = {"UNKNOWN": 0, "LOW": 1, "MODERATE": 2, "HIGH": 3, "CRITICAL": 4}

# check_id -> (auto_fix_id | None, human root cause, human suggested fix)
# A non-None auto_fix_id means the AutoRepairEngine can fix it deterministically.
_FAILED_CHECK_MAP: dict[str, tuple[str | None, str, str]] = {
    "readme_content": ("readme_missing", "O gerador não criou a documentação inicial.", "Criar README.md com setup, execução e estrutura."),
    "spring_readme": ("readme_missing", "O gerador não criou a documentação inicial.", "Criar README.md com setup, execução e estrutura."),
    "env_example_exists": ("env_example_missing", "O template de variáveis de ambiente não foi gerado.", "Criar .env.example com placeholders seguros."),
    "env_example_content": ("env_example_missing", ".env.example está vazio.", "Regerar .env.example com placeholders seguros."),
    "fastapi_requirements": ("requirements_missing", "Projeto Python sem requirements.txt.", "Criar requirements.txt com as dependências base."),
    "nestjs_tsconfig": ("tsconfig_missing", "Projeto TypeScript sem tsconfig.json.", "Criar tsconfig.json base."),
    "spring_pom": ("pom_missing", "Projeto Java sem pom.xml.", "Criar pom.xml mínimo do Spring Boot."),
    # Generic ecosystem manifest checks ({language}_manifest) emitted by the
    # quality engine for frameworks beyond the hardcoded set — each maps to a
    # deterministic minimal-manifest fixer.
    "python_manifest": ("requirements_missing", "Projeto Python sem requirements.txt.", "Criar requirements.txt com as dependências base."),
    "typescript_manifest": ("package_json_missing", "Projeto Node/TypeScript sem package.json.", "Criar package.json mínimo com scripts básicos."),
    "java_manifest": ("pom_missing", "Projeto Java sem pom.xml.", "Criar pom.xml mínimo."),
    "go_manifest": ("go_mod_missing", "Projeto Go sem go.mod.", "Criar go.mod mínimo (module + versão do Go)."),
    "php_manifest": ("composer_json_missing", "Projeto PHP sem composer.json.", "Criar composer.json mínimo."),
    "rust_manifest": ("cargo_toml_missing", "Projeto Rust sem Cargo.toml.", "Criar Cargo.toml mínimo."),
    "ruby_manifest": ("gemfile_missing", "Projeto Ruby sem Gemfile.", "Criar Gemfile mínimo."),
    "csharp_manifest": ("csproj_missing", "Projeto .NET sem arquivo .csproj.", "Criar .csproj mínimo (net8.0)."),
    "kotlin_manifest": ("gradle_kts_missing", "Projeto Kotlin sem build.gradle.kts.", "Criar build.gradle.kts mínimo."),
    "expo_app_json": ("expo_app_json_missing", "Projeto Expo sem app.json.", "Criar apps/mobile/app.json com configuracao base."),
    "expo_readme": ("expo_readme_missing", "App mobile sem instrucoes de execucao.", "Criar apps/mobile/README.md com setup Expo."),
    "expo_gitignore": ("expo_gitignore_missing", "App mobile sem .gitignore proprio.", "Criar apps/mobile/.gitignore com artefatos nativos e npm."),
}

# security finding code -> (auto_fix_id | None, severity, root cause, suggested fix)
_FINDING_MAP: dict[str, tuple[str | None, str, str]] = {
    "real_env_or_secret_file": ("real_env_file", "Um arquivo .env/secret real foi incluído no projeto gerado.", "Remover o arquivo de segredo; manter apenas .env.example."),
    "hardcoded_secret": (None, "Um valor sensível foi escrito diretamente no código gerado.", "Substituir por variável de ambiente; nunca commitar segredos."),
    "path_traversal": (None, "Um caminho de arquivo escapa da raiz do projeto.", "Regerar o arquivo com caminho relativo seguro."),
    "symlink_escape": (None, "Um symlink aponta para fora do projeto.", "Remover o symlink inseguro."),
    "zip_path_traversal": (None, "O ZIP contém entradas com path traversal.", "Regerar o pacote sem caminhos inseguros."),
    "zip_workspace_root": (None, "O ZIP contém conteúdo da raiz do workspace.", "Regerar o pacote apenas com o projeto."),
}


class QualityGateEngine:
    def __init__(self) -> None:
        self._quality = GeneratedProjectQualityEngine()

    def evaluate(self, project: dict[str, Any], *, run_build: bool = True) -> QualityGateReport:
        if run_build:
            validation = generation_validation_engine.validate(project)
            quality = validation.quality if isinstance(validation.quality, dict) else {}
            build_ok = validation.build.ok
            dependency = validation.dependency_audit
        else:
            quality = self._quality.quality_check(project)
            build_ok = None
            dependency = None

        issues: list[QualityIssue] = []

        # 1. Real build failure (only when we ran it) — always a BLOCKER.
        if build_ok is False:
            issues.append(
                QualityIssue(
                    id="build_failed",
                    title="O build do projeto falhou",
                    severity="BLOCKER",
                    category="build",
                    file=None,
                    root_cause="O projeto não compila/instala com a toolchain do seu stack.",
                    suggested_fix="Use a verificação profunda (sala de teste) para reparar o build, ou corrija os erros listados.",
                    auto_fixable=False,
                )
            )

        # 2. Failed required structural/doc checks.
        for check in quality.get("checks") or []:
            if not isinstance(check, dict) or check.get("status") != "failed" or not check.get("required"):
                continue
            check_id = str(check.get("id"))
            fix_id, root_cause, suggested = _FAILED_CHECK_MAP.get(
                check_id,
                (None, str(check.get("message") or "Verificação obrigatória falhou."),
                 "Regerar o artefato faltante a partir do PromptMaster."),
            )
            paths = check.get("paths") or []
            issues.append(
                QualityIssue(
                    id=fix_id or f"check:{check_id}",
                    title=str(check.get("label") or check_id),
                    severity="BLOCKER",
                    category=str(check.get("category") or "structure"),
                    file=str(paths[0]) if paths else None,
                    root_cause=root_cause,
                    suggested_fix=suggested,
                    auto_fixable=fix_id is not None,
                )
            )

        # 3. Security findings.
        for finding in quality.get("security_findings") or []:
            if not isinstance(finding, dict):
                continue
            code = str(finding.get("code"))
            fix_id, root_cause, suggested = _FINDING_MAP.get(
                code, (None, str(finding.get("message") or "Problema de segurança detectado."), "Revise e corrija o achado de segurança.")
            )
            path = finding.get("path")
            issues.append(
                QualityIssue(
                    id=f"{fix_id}:{path}" if fix_id else f"security:{code}:{path}",
                    title=str(finding.get("message") or code),
                    severity="BLOCKER",
                    category="security",
                    file=str(path) if path else None,
                    root_cause=root_cause,
                    suggested_fix=suggested,
                    auto_fixable=fix_id is not None,
                )
            )

        # 4. Dependency audit (only when we built): missing/vulnerable(CRITICAL|HIGH)
        # -> BLOCKER, outdated/vulnerable(MODERATE|LOW|UNKNOWN) -> WARNING.
        if dependency is not None and dependency.status == "failed":
            for finding in dependency.findings:
                if finding.status == "vulnerable":
                    worst = max((v.severity for v in finding.vulnerabilities), key=lambda s: _SEVERITY_RANK.get(s, 0), default="UNKNOWN")
                    ids = ", ".join(sorted({v.id for v in finding.vulnerabilities})[:5])
                    issues.append(
                        QualityIssue(
                            id=f"dependency_cve:{finding.ecosystem}:{finding.name}",
                            title=f"Vulnerabilidade conhecida em {finding.name}@{finding.requested_version}",
                            severity="BLOCKER" if worst in {"CRITICAL", "HIGH"} else "WARNING",
                            category="dependency",
                            file=finding.manifest_path,
                            root_cause=finding.message,
                            suggested_fix=f"Atualizar {finding.name} para uma versão sem os CVEs/GHSAs listados ({ids}).",
                            auto_fixable=False,
                        )
                    )
                    continue
                blocker = finding.status == "missing"
                issues.append(
                    QualityIssue(
                        id=f"dependency:{finding.ecosystem}:{finding.name}",
                        title=f"Dependência {finding.status}: {finding.name}",
                        severity="BLOCKER" if blocker else "WARNING",
                        category="dependency",
                        file=finding.manifest_path,
                        root_cause=finding.message,
                        suggested_fix="Ajuste a versão/dependência no manifesto do projeto.",
                        auto_fixable=False,
                    )
                )

        # 5. Extra deterministic detections beyond quality_check.
        issues.extend(self._extra_detections(project, quality))

        # 5b. External Integration Audit: opt-in enforcement + resilience/test
        # coverage for third-party providers (Stripe, SendGrid, ...). Runs even
        # when run_build=False -- it's pure file inspection, no build needed.
        issues.extend(external_integration_audit_engine.audit(project))

        # 6. Quality warnings -> WARNING (non-blocking).
        for warning in quality.get("warnings") or []:
            issues.append(
                QualityIssue(
                    id=f"warning:{abs(hash(warning)) % 10_000}",
                    title=str(warning),
                    severity="WARNING",
                    category="quality",
                    file=None,
                    root_cause=str(warning),
                    suggested_fix="Melhoria recomendada; não bloqueia a entrega.",
                    auto_fixable=False,
                )
            )

        return self._assemble(project, issues, built=run_build, base_score=int(quality.get("score") or 0))

    # ------------------------------------------------------------------ helpers
    def _extra_detections(self, project: dict[str, Any], quality: dict[str, Any]) -> list[QualityIssue]:
        root = self._root(project)
        if root is None:
            return []
        out: list[QualityIssue] = []

        readme = root / "README.md"
        if readme.is_file():
            text = readme.read_text(encoding="utf-8", errors="ignore").lower()
            run_tokens = (
                "npm run", "docker", "uvicorn", "mvn", "## como rodar", "## run", "yarn",
                "go run", "cargo run", "dotnet run", "php artisan", "bundle exec",
                "gradle", "composer install", "rails server",
            )
            if not any(token in text for token in run_tokens):
                out.append(QualityIssue(
                    id="readme_no_run", title="README sem instruções de execução", severity="WARNING",
                    category="readme", file="README.md",
                    root_cause="O README não explica como executar o projeto.",
                    suggested_fix="Adicionar uma seção de execução ao README.",
                    auto_fixable=True,
                ))

        package = root / "package.json"
        if package.is_file():
            text = package.read_text(encoding="utf-8", errors="ignore")
            if '"scripts"' not in text or not any(s in text for s in ('"build"', '"start"', '"dev"')):
                out.append(QualityIssue(
                    id="package_scripts_missing", title="package.json sem scripts básicos", severity="WARNING",
                    category="structure", file="package.json",
                    root_cause="O package.json não define scripts de build/start.",
                    suggested_fix="Adicionar scripts básicos (dev/build/start) ao package.json.",
                    auto_fixable=True,
                ))

        if not (root / ".gitignore").is_file():
            out.append(QualityIssue(
                id="gitignore_missing", title=".gitignore ausente", severity="WARNING",
                category="structure", file=".gitignore",
                root_cause="Sem .gitignore: artefatos e segredos podem ser commitados por engano.",
                suggested_fix="Adicionar um .gitignore com ignores comuns.",
                auto_fixable=True,
            ))

        # FastAPI health endpoint.
        if (root / "app" / "main.py").is_file():
            has_health = any(
                "health" in p.name.lower() and p.suffix == ".py" for p in (root / "app").rglob("*.py")
            ) or "/health" in (root / "app" / "main.py").read_text(encoding="utf-8", errors="ignore")
            if not has_health:
                out.append(QualityIssue(
                    id="health_endpoint_missing", title="Endpoint de health ausente", severity="WARNING",
                    category="structure", file="app/api/health.py",
                    root_cause="Backend sem endpoint /health para readiness/liveness.",
                    suggested_fix="Criar uma rota /health simples.",
                    auto_fixable=True,
                ))

        return out

    def _assemble(self, project: dict[str, Any], issues: list[QualityIssue], *, built: bool, base_score: int) -> QualityGateReport:
        blockers = [i for i in issues if i.severity == "BLOCKER"]
        warnings = [i for i in issues if i.severity == "WARNING"]
        infos = [i for i in issues if i.severity == "INFO"]
        passed = not blockers
        override = self._release_override(project)
        return QualityGateReport(
            project_id=str(project["project_id"]),
            passed=passed,
            can_release=passed or override,
            release_override=override,
            score=base_score,
            built=built,
            blocker_count=len(blockers),
            warning_count=len(warnings),
            info_count=len(infos),
            issues=issues,
            generated_at=datetime.now(UTC).replace(microsecond=0).isoformat(),
        )

    def _root(self, project: dict[str, Any]) -> Path | None:
        raw = project.get("generated_project_path")
        if not raw:
            return None
        root = Path(str(raw)).resolve()
        return root if root.is_dir() else None

    def _release_override(self, project: dict[str, Any]) -> bool:
        root = self._root(project)
        if root is None:
            return False
        marker = root / ".ldcn-generation.json"
        if not marker.is_file():
            return False
        try:
            import json

            data = json.loads(marker.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return False
        meta = data.get("metadata") if isinstance(data, dict) else None
        return bool(isinstance(meta, dict) and (meta.get("release_override") or {}).get("active"))


quality_gate_engine = QualityGateEngine()
