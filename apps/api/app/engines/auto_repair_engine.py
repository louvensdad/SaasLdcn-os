from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

from app.schemas.auto_repair import RepairAction, RepairPlan, RepairResult
from app.schemas.quality_gate import QualityGateReport, QualityIssue
from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriteError, ProjectWriter


# Deterministic Auto-Repair: NO LLM, NO shell. Every fix goes through ProjectWriter
# (path-allowlisted, stays inside the project root, refuses traversal/marker). It
# fixes the safe, high-value class of problems and NEVER silently touches a BLOCKER
# it cannot safely fix — those stay in the report for the heavy build / the user.

_README = """# {name}

> Gerado pela LDCN OS Meta-Fábrica.

## Como rodar

```bash
# instale as dependências do seu stack e suba o projeto
docker compose up --build
```

## Estrutura

Veja os diretórios em `apps/` e a documentação do projeto.

## Variáveis de ambiente

Copie `.env.example` para `.env` e ajuste os valores locais.
"""

_RUN_SECTION = """

## Como rodar

```bash
docker compose up --build
```
"""

_ENV_EXAMPLE = """# Gerado pela LDCN OS — nunca commite valores reais.
API_PORT=8000
JWT_SECRET=change-me
DATABASE_URL=sqlite:///./app.db
"""

_REQUIREMENTS = "fastapi==0.115.0\nuvicorn==0.30.6\npydantic==2.8.2\n"

_TSCONFIG = json.dumps(
    {
        "compilerOptions": {
            "target": "ES2022",
            "module": "ESNext",
            "moduleResolution": "Bundler",
            "strict": True,
            "esModuleInterop": True,
            "outDir": "dist",
            "rootDir": "src",
        },
        "include": ["src"],
    },
    indent=2,
) + "\n"

_POM = """<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.ldcn</groupId>
  <artifactId>generated-api</artifactId>
  <version>1.0.0</version>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.0</version>
  </parent>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
  </dependencies>
</project>
"""

_HEALTH = """from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}
"""

_GITIGNORE = """# Gerado pela LDCN OS
node_modules/
dist/
build/
target/
__pycache__/
*.pyc
.venv/
.env
.env.local
*.log
.DS_Store
"""


class AutoRepairEngine:
    def __init__(self, writer: ProjectWriter | None = None) -> None:
        self.writer = writer or ProjectWriter()
        self._fixers: dict[str, Callable[[dict[str, Any], QualityIssue], RepairAction]] = {
            "readme_missing": self._fix_readme,
            "readme_no_run": self._fix_readme_run,
            "env_example_missing": self._fix_env_example,
            "requirements_missing": self._fix_requirements,
            "tsconfig_missing": self._fix_tsconfig,
            "pom_missing": self._fix_pom,
            "package_scripts_missing": self._fix_package_scripts,
            "health_endpoint_missing": self._fix_health,
            "src_missing": self._fix_src,
            "gitignore_missing": self._fix_gitignore,
            "real_env_file": self._fix_remove_secret_file,
        }

    def plan(self, report: QualityGateReport) -> RepairPlan:
        return RepairPlan(
            project_id=report.project_id,
            actions=[issue.id for issue in report.issues if issue.auto_fixable],
        )

    def repair(self, project: dict[str, Any], report: QualityGateReport) -> RepairResult:
        actions: list[RepairAction] = []
        for issue in report.issues:
            if not issue.auto_fixable:
                continue
            fixer = self._fixers.get(self._fixer_key(issue.id))
            if fixer is None:
                continue
            try:
                actions.append(fixer(project, issue))
            except (ProjectWriteError, OSError, ValueError) as exc:
                actions.append(
                    RepairAction(issue_id=issue.id, title=issue.title, status="failed", detail=str(exc))
                )

        applied = [a for a in actions if a.status == "applied"]
        diff: list[str] = []
        for action in applied:
            diff += [f"+ {p}" for p in action.files_written]
            diff += [f"- {p}" for p in action.files_deleted]
        return RepairResult(
            project_id=str(project["project_id"]),
            actions=actions,
            applied_count=len(applied),
            failed_count=len([a for a in actions if a.status == "failed"]),
            skipped_count=len([a for a in actions if a.status == "skipped"]),
            diff_summary=diff,
        )

    # ------------------------------------------------------------------ fixers
    def _fixer_key(self, issue_id: str) -> str:
        return issue_id.split(":", 1)[0]

    def _write(self, project: dict[str, Any], issue: QualityIssue, path: str, content: str) -> RepairAction:
        self.writer.append(str(project["project_id"]), [EmittedFile(path=path, content=content)], metadata={"auto_repaired": True})
        return RepairAction(issue_id=issue.id, title=issue.title, status="applied", files_written=[path])

    def _fix_readme(self, project: dict[str, Any], issue: QualityIssue) -> RepairAction:
        name = str(project.get("project_name") or project.get("project_id") or "Projeto")
        return self._write(project, issue, "README.md", _README.format(name=name))

    def _fix_readme_run(self, project: dict[str, Any], issue: QualityIssue) -> RepairAction:
        root = self._root(project)
        existing = (root / "README.md").read_text(encoding="utf-8", errors="ignore") if root and (root / "README.md").is_file() else ""
        return self._write(project, issue, "README.md", existing.rstrip() + _RUN_SECTION)

    def _fix_env_example(self, project: dict[str, Any], issue: QualityIssue) -> RepairAction:
        return self._write(project, issue, ".env.example", _ENV_EXAMPLE)

    def _fix_requirements(self, project: dict[str, Any], issue: QualityIssue) -> RepairAction:
        return self._write(project, issue, "requirements.txt", _REQUIREMENTS)

    def _fix_tsconfig(self, project: dict[str, Any], issue: QualityIssue) -> RepairAction:
        return self._write(project, issue, "tsconfig.json", _TSCONFIG)

    def _fix_pom(self, project: dict[str, Any], issue: QualityIssue) -> RepairAction:
        return self._write(project, issue, "pom.xml", _POM)

    def _fix_health(self, project: dict[str, Any], issue: QualityIssue) -> RepairAction:
        return self._write(project, issue, "app/api/health.py", _HEALTH)

    def _fix_src(self, project: dict[str, Any], issue: QualityIssue) -> RepairAction:
        return self._write(project, issue, "src/.gitkeep", "")

    def _fix_gitignore(self, project: dict[str, Any], issue: QualityIssue) -> RepairAction:
        return self._write(project, issue, ".gitignore", _GITIGNORE)

    def _fix_package_scripts(self, project: dict[str, Any], issue: QualityIssue) -> RepairAction:
        root = self._root(project)
        if root is None or not (root / "package.json").is_file():
            return RepairAction(issue_id=issue.id, title=issue.title, status="skipped", detail="package.json not found")
        data = json.loads((root / "package.json").read_text(encoding="utf-8", errors="ignore") or "{}")
        scripts = data.get("scripts") if isinstance(data.get("scripts"), dict) else {}
        scripts.setdefault("dev", "next dev")
        scripts.setdefault("build", "next build")
        scripts.setdefault("start", "next start")
        data["scripts"] = scripts
        return self._write(project, issue, "package.json", json.dumps(data, indent=2) + "\n")

    def _fix_remove_secret_file(self, project: dict[str, Any], issue: QualityIssue) -> RepairAction:
        if not issue.file:
            return RepairAction(issue_id=issue.id, title=issue.title, status="skipped", detail="no file path")
        removed = self.writer.delete(str(project["project_id"]), issue.file)
        return RepairAction(
            issue_id=issue.id,
            title=issue.title,
            status="applied" if removed else "skipped",
            files_deleted=[issue.file] if removed else [],
            detail="" if removed else "file already absent",
        )

    def _root(self, project: dict[str, Any]) -> Path | None:
        raw = project.get("generated_project_path")
        if not raw:
            return None
        root = Path(str(raw)).resolve()
        return root if root.is_dir() else None


auto_repair_engine = AutoRepairEngine()
