from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import time
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status

from app.data.foundation import CONTRACT_VERSION
from app.engines.codebase_analysis_engine import analyze, build_inventory
from app.schemas.engineering_lab import (
    EngineeringLabApiEndpoint,
    EngineeringLabArchitectureEdge,
    EngineeringLabArchitectureNode,
    EngineeringLabDependency,
    EngineeringLabModule,
    EngineeringLabOverview,
    EngineeringLabTerminalChunk,
    EngineeringLabTerminalResponse,
)
from app.services.codebase_ingest_service import codebase_ingest_service
from app.services.project_writer import DEFAULT_OUTPUT_ROOT

_SAFE_PROJECT_ID = re.compile(r"^[A-Za-z0-9_.-]+$")
_IMPORT_RE = re.compile(r"^\s*(?:import|from)\s+([A-Za-z0-9_.@/\-]+)", re.MULTILINE)
_API_ROUTE_RE = re.compile(r"(?:@(?:app|router)\.(get|post|put|patch|delete|head|options)\(['\"]([^'\"]+)['\"]|app\.(get|post|put|patch|delete|head|options)\(['\"]([^'\"]+)['\"])", re.I)

# Per-ecosystem route declarations beyond the FastAPI/Express style above.
# Each entry: (pattern, method group index or fixed method, path group index).
# Every specialist ecosystem the factory generates must be inspectable here.
_ECOSYSTEM_ROUTE_PATTERNS: list[tuple[re.Pattern[str], int | str, int]] = [
    # Spring / Kotlin: @GetMapping("/x"), @RequestMapping("/x")
    (re.compile(r"@(Get|Post|Put|Patch|Delete)Mapping\s*\(\s*(?:value\s*=\s*)?['\"]([^'\"]+)['\"]"), 1, 2),
    (re.compile(r"@RequestMapping\s*\(\s*(?:value\s*=\s*)?['\"]([^'\"]+)['\"]"), "GET", 1),
    # Go: gin/echo/fiber method calls and net/http|mux HandleFunc
    (re.compile(r"\.\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(\s*\"(/[^\"]*)\""), 1, 2),
    (re.compile(r"\.HandleFunc\s*\(\s*\"(/[^\"]*)\""), "GET", 1),
    # Laravel: Route::get('/x', ...)
    (re.compile(r"Route::(get|post|put|patch|delete|options|any)\s*\(\s*['\"]([^'\"]+)['\"]"), 1, 2),
    # ASP.NET: [HttpGet("x")] attributes and minimal APIs app.MapGet("/x", ...)
    (re.compile(r"\[Http(Get|Post|Put|Patch|Delete)\s*\(\s*\"([^\"]+)\""), 1, 2),
    (re.compile(r"\.Map(Get|Post|Put|Patch|Delete)\s*\(\s*\"([^\"]+)\""), 1, 2),
]

# Rails declares routes only in config/routes.rb; matching these verbs anywhere
# else would flood the explorer with false positives.
_RAILS_ROUTE_RE = re.compile(r"^\s*(get|post|put|patch|delete)\s+['\"]([^'\"]+)['\"]", re.MULTILINE)
_DB_MARKERS = {
    "postgresql": re.compile(r"postgres|psycopg|pg_", re.I),
    "mysql": re.compile(r"mysql|mariadb", re.I),
    "sqlite": re.compile(r"sqlite|\.db", re.I),
    "mongodb": re.compile(r"mongodb|mongoose", re.I),
    "redis": re.compile(r"redis", re.I),
}
_CLOUD_MARKERS = {
    "AWS": re.compile(r"\baws\b|amazonaws|serverless\.yml", re.I),
    "Azure": re.compile(r"\bazure\b", re.I),
    "Google Cloud": re.compile(r"\bgcp\b|google cloud|cloud run", re.I),
    "Vercel": re.compile(r"vercel", re.I),
    "Kubernetes": re.compile(r"\bkubernetes\b|\bk8s\b|kind:\s*Deployment", re.I),
}
_ALLOWED_COMMANDS = {
    "npm", "pnpm", "bun", "yarn", "node", "npx", "maven", "mvn", "gradle", "java",
    "python", "python3", "pip", "pip3", "go", "cargo", "dotnet", "php", "composer",
    "ruby", "bundle", "rails", "docker", "kubectl", "git", "gh", "terraform",
    "ansible", "powershell", "pwsh", "bash", "zsh", "fish", "sh", "cmd",
}

# Shell interpreters are allow-listed (the brief wants them), but their inline
# command flags (bash -c "...", cmd /c "...", powershell -Command "...") turn the
# allow-list into a no-op by executing arbitrary code. Reject those flags so a
# shell can only run a script inside the sandboxed project dir.
_SHELL_INTERPRETERS = {"bash", "sh", "zsh", "fish", "powershell", "pwsh", "cmd"}
_SHELL_EXEC_FLAGS = {"-c", "-command", "-encodedcommand", "-e", "-ec", "/c", "/k"}

# Language runtimes get the same treatment: their inline-eval flags (node -e,
# python -c, php -r, ruby -e) are the identical bypass in another spelling.
# Running project scripts/tools stays allowed; evaluating arbitrary inline code
# from the request does not.
_RUNTIME_INTERPRETERS = {"node", "python", "python3", "ruby", "php"}
_RUNTIME_EVAL_FLAGS = {"-e", "-c", "-r", "-p", "--eval", "--print", "--run"}

# Hard ceiling on a single command so a request can't pin a worker thread.
_TERMINAL_TIMEOUT_MAX = 120

# Minimal, secret-free environment for terminal subprocesses. The backend process
# environment carries app secrets (LDCN_SECRET_KEY, LDCN_TOKEN_ENC_KEY, provider
# API keys, DB credentials); an executed command must never be able to read them.
_ENV_ALLOW = (
    "PATH", "HOME", "LANG", "LC_ALL", "TZ", "PATHEXT", "ComSpec", "SystemRoot",
    "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "USERPROFILE", "HOMEPATH", "HOMEDRIVE",
    "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE",
)


def _safe_terminal_env() -> dict[str, str]:
    env = {key: os.environ[key] for key in _ENV_ALLOW if key in os.environ}
    env.setdefault("CI", "1")
    return env


class EngineeringLabEngine:
    def __init__(self) -> None:
        self.workspace_root = DEFAULT_OUTPUT_ROOT.parents[1].resolve()

    def overview(self, project_id: str) -> EngineeringLabOverview:
        root = self._project_root(project_id)
        ingest_id = codebase_ingest_service.register_root(root)
        inventory = build_inventory(ingest_id, "zip", 0, codebase_ingest_service)
        diagnosis = analyze(ingest_id, inventory, codebase_ingest_service)
        files = list(codebase_ingest_service.iter_files(ingest_id))
        line_count = self._line_count(files)
        dependencies = self._dependencies(root)
        containers = self._containers(root)
        databases = self._markers(root, _DB_MARKERS)
        cloud = self._markers(root, _CLOUD_MARKERS)
        api_endpoints = self._api_endpoints(files)
        nodes, edges = self._architecture(files)
        build = self._build_status(root)
        coverage = self._coverage_status(root)
        health_score = self._health_score(
            security_count=len(diagnosis.security_findings),
            smell_count=len(diagnosis.smells),
            build_configured=build != "not_configured",
            test_configured=coverage != "not_configured",
        )

        return EngineeringLabOverview(
            contractVersion=CONTRACT_VERSION,
            project_id=project_id,
            project_path=str(root),
            project_name=root.name,
            stack=diagnosis.detected_stack,
            primary_language=diagnosis.primary_language,
            languages=inventory.languages,
            file_count=inventory.file_count,
            line_count=line_count,
            dependency_count=len(dependencies),
            dependencies=dependencies[:200],
            containers=containers,
            databases=databases,
            cloud=cloud,
            build=build,
            coverage=coverage,
            status="critical" if any(f.severity == "critical" for f in diagnosis.security_findings) else "ready",
            health_score=health_score,
            last_analysis=datetime.now(UTC).replace(microsecond=0).isoformat(),
            inventory=inventory,
            diagnosis=diagnosis,
            api_endpoints=api_endpoints[:100],
            architecture_nodes=nodes[:80],
            architecture_edges=edges[:160],
            modules=self._modules(diagnosis, api_endpoints, containers, databases, cloud, build, coverage),
        )

    def run_terminal(self, project_id: str, command: str, timeout_seconds: int) -> EngineeringLabTerminalResponse:
        root = self._project_root(project_id)
        started = time.perf_counter()
        timeout_seconds = max(1, min(_TERMINAL_TIMEOUT_MAX, int(timeout_seconds)))
        argv = self._command_argv(command)
        executable = Path(argv[0]).name.lower()
        if executable.endswith(".exe"):
            executable = executable[:-4]
        if executable not in _ALLOWED_COMMANDS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Command '{argv[0]}' is not allowed in Engineering Laboratory.")
        if executable in _SHELL_INTERPRETERS and any(arg.lower() in _SHELL_EXEC_FLAGS for arg in argv[1:]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Inline shell execution (e.g. bash -c, cmd /c) is not allowed. Run a script or an allow-listed tool instead.",
            )
        if executable in _RUNTIME_INTERPRETERS:
            # Only the interpreter's own leading flags count: `python -c "..."` is
            # inline eval, but `python -m pip install -r req.txt` passes -r to pip.
            for arg in argv[1:]:
                if not arg.startswith("-"):
                    break
                if arg.lower() in _RUNTIME_EVAL_FLAGS:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Inline code evaluation (e.g. node -e, python -c, php -r) is not allowed. Run a project script instead.",
                    )

        try:
            completed = subprocess.run(
                argv,
                cwd=root,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
                shell=False,
                env=_safe_terminal_env(),
            )
            exit_code = completed.returncode
            stdout = completed.stdout[-20_000:]
            stderr = completed.stderr[-20_000:]
        except FileNotFoundError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Command '{argv[0]}' is not installed on the backend.") from exc
        except subprocess.TimeoutExpired as exc:
            exit_code = 124
            stdout = (exc.stdout or "")[-20_000:] if isinstance(exc.stdout, str) else ""
            stderr = ((exc.stderr or "")[-20_000:] if isinstance(exc.stderr, str) else "") + f"\nCommand timed out after {timeout_seconds}s."

        output: list[EngineeringLabTerminalChunk] = []
        if stdout:
            output.append(EngineeringLabTerminalChunk(kind="stdout", text=stdout))
        if stderr:
            output.append(EngineeringLabTerminalChunk(kind="stderr", text=stderr))
        return EngineeringLabTerminalResponse(
            project_id=project_id,
            command=command,
            cwd=str(root),
            exit_code=exit_code,
            duration_ms=max(1, int((time.perf_counter() - started) * 1000)),
            output=output,
        )

    def _project_root(self, project_id: str) -> Path:
        if not _SAFE_PROJECT_ID.match(project_id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid project id.")
        root = (DEFAULT_OUTPUT_ROOT / project_id).resolve()
        output_root = DEFAULT_OUTPUT_ROOT.resolve()
        if root != output_root and output_root not in root.parents:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project path escapes generated-projects.")
        if not root.is_dir():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generated project was not found.")
        return root

    def _command_argv(self, command: str) -> list[str]:
        try:
            argv = shlex.split(command, posix=os.name != "nt")
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid command syntax.") from exc
        if not argv:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Command is required.")
        return argv

    def _line_count(self, files: list[tuple[str, Path, str]]) -> int:
        total = 0
        for _rel, path, _language in files:
            try:
                total += len(path.read_text(encoding="utf-8", errors="ignore").splitlines())
            except OSError:
                continue
        return total

    def _dependencies(self, root: Path) -> list[EngineeringLabDependency]:
        deps: list[EngineeringLabDependency] = []
        package_json = root / "package.json"
        if package_json.is_file():
            try:
                data = json.loads(package_json.read_text(encoding="utf-8"))
                for source in ["dependencies", "devDependencies"]:
                    for name, version in (data.get(source) or {}).items():
                        deps.append(EngineeringLabDependency(name=name, version=str(version), source=f"package.json:{source}"))
            except (json.JSONDecodeError, OSError):
                pass
        requirements = root / "requirements.txt"
        if requirements.is_file():
            for line in requirements.read_text(encoding="utf-8", errors="ignore").splitlines():
                item = line.strip()
                if not item or item.startswith("#"):
                    continue
                match = re.match(r"([A-Za-z0-9_.-]+)(?:[=<>!~]=?\s*(.+))?", item)
                if match:
                    deps.append(EngineeringLabDependency(name=match.group(1), version=match.group(2), source="requirements.txt"))
        pom = root / "pom.xml"
        if pom.is_file():
            text = pom.read_text(encoding="utf-8", errors="ignore")
            for artifact in re.findall(r"<artifactId>([^<]+)</artifactId>", text):
                deps.append(EngineeringLabDependency(name=artifact, source="pom.xml"))
        deps.extend(self._ecosystem_dependencies(root))
        return deps

    def _ecosystem_dependencies(self, root: Path) -> list[EngineeringLabDependency]:
        """Dependency extraction for the remaining specialist ecosystems (Go, PHP,
        Rust, Ruby, .NET, Gradle) — always from the REAL manifests, never inferred."""
        deps: list[EngineeringLabDependency] = []

        go_mod = root / "go.mod"
        if go_mod.is_file():
            text = go_mod.read_text(encoding="utf-8", errors="ignore")
            for module, version in re.findall(r"^\s+([\w./\-]+)\s+(v[\w.\-+]+)", text, re.MULTILINE):
                deps.append(EngineeringLabDependency(name=module, version=version, source="go.mod"))

        composer = root / "composer.json"
        if composer.is_file():
            try:
                data = json.loads(composer.read_text(encoding="utf-8"))
                for source in ["require", "require-dev"]:
                    for name, version in (data.get(source) or {}).items():
                        deps.append(EngineeringLabDependency(name=name, version=str(version), source=f"composer.json:{source}"))
            except (json.JSONDecodeError, OSError):
                pass

        cargo = root / "Cargo.toml"
        if cargo.is_file():
            text = cargo.read_text(encoding="utf-8", errors="ignore")
            in_deps = False
            for line in text.splitlines():
                stripped = line.strip()
                if stripped.startswith("["):
                    in_deps = stripped in {"[dependencies]", "[dev-dependencies]", "[build-dependencies]"}
                    continue
                if in_deps:
                    match = re.match(r"([\w\-]+)\s*=\s*(?:\"([^\"]+)\"|\{.*version\s*=\s*\"([^\"]+)\")", stripped)
                    if match:
                        deps.append(EngineeringLabDependency(name=match.group(1), version=match.group(2) or match.group(3), source="Cargo.toml"))

        gemfile = root / "Gemfile"
        if gemfile.is_file():
            text = gemfile.read_text(encoding="utf-8", errors="ignore")
            for name, version in re.findall(r"^\s*gem\s+['\"]([\w\-]+)['\"](?:\s*,\s*['\"]([^'\"]+)['\"])?", text, re.MULTILINE):
                deps.append(EngineeringLabDependency(name=name, version=version or None, source="Gemfile"))

        for csproj in sorted(root.glob("*.csproj")) + sorted(root.glob("*/*.csproj")):
            text = csproj.read_text(encoding="utf-8", errors="ignore")
            for name, version in re.findall(r"<PackageReference\s+Include=\"([^\"]+)\"(?:\s+Version=\"([^\"]+)\")?", text):
                deps.append(EngineeringLabDependency(name=name, version=version or None, source=csproj.name))

        for gradle_name in ["build.gradle", "build.gradle.kts"]:
            gradle = root / gradle_name
            if gradle.is_file():
                text = gradle.read_text(encoding="utf-8", errors="ignore")
                for coordinate in re.findall(r"(?:implementation|api|testImplementation|runtimeOnly)\s*[\(\s]['\"]([^'\"]+)['\"]", text):
                    parts = coordinate.split(":")
                    name = ":".join(parts[:2]) if len(parts) >= 2 else coordinate
                    version = parts[2] if len(parts) >= 3 else None
                    deps.append(EngineeringLabDependency(name=name, version=version, source=gradle_name))
        return deps

    def _containers(self, root: Path) -> list[str]:
        names = []
        for candidate in ["Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]:
            if (root / candidate).exists():
                names.append(candidate)
        return names

    def _markers(self, root: Path, markers: dict[str, re.Pattern[str]]) -> list[str]:
        found: set[str] = set()
        for path in root.rglob("*"):
            if not path.is_file() or path.stat().st_size > 512_000:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
            for label, pattern in markers.items():
                if pattern.search(text) or pattern.search(path.as_posix()):
                    found.add(label)
        return sorted(found)

    def _api_endpoints(self, files: list[tuple[str, Path, str]]) -> list[EngineeringLabApiEndpoint]:
        endpoints: list[EngineeringLabApiEndpoint] = []
        for rel, path, _language in files:
            text = path.read_text(encoding="utf-8", errors="ignore")
            if "openapi" in rel.lower() or "swagger" in rel.lower():
                endpoints.append(EngineeringLabApiEndpoint(method="OPENAPI", path=rel, source=rel))
            for match in _API_ROUTE_RE.finditer(text):
                method = (match.group(1) or match.group(3) or "GET").upper()
                route = match.group(2) or match.group(4) or "/"
                endpoints.append(EngineeringLabApiEndpoint(method=method, path=route, source=rel))
            for pattern, method_ref, path_group in _ECOSYSTEM_ROUTE_PATTERNS:
                for match in pattern.finditer(text):
                    method = method_ref if isinstance(method_ref, str) else match.group(method_ref)
                    endpoints.append(EngineeringLabApiEndpoint(method=method.upper(), path=match.group(path_group), source=rel))
            if rel.replace("\\", "/").endswith("config/routes.rb"):
                for match in _RAILS_ROUTE_RE.finditer(text):
                    endpoints.append(EngineeringLabApiEndpoint(method=match.group(1).upper(), path=match.group(2), source=rel))
        return endpoints

    def _architecture(self, files: list[tuple[str, Path, str]]) -> tuple[list[EngineeringLabArchitectureNode], list[EngineeringLabArchitectureEdge]]:
        folders = Counter(Path(rel).parts[0] if len(Path(rel).parts) > 1 else "root" for rel, _path, _language in files)
        nodes = [EngineeringLabArchitectureNode(id=name, label=f"{name} ({count})", kind="module") for name, count in folders.most_common(80)]
        node_ids = {node.id for node in nodes}
        edge_counts: Counter[tuple[str, str]] = Counter()
        for rel, path, _language in files:
            source = Path(rel).parts[0] if len(Path(rel).parts) > 1 else "root"
            text = path.read_text(encoding="utf-8", errors="ignore")
            for imported in _IMPORT_RE.findall(text):
                target = imported.split(".")[0].split("/")[0].replace("@", "")
                if target in node_ids and target != source:
                    edge_counts[(source, target)] += 1
        edges = [
            EngineeringLabArchitectureEdge(source=source, target=target, label=f"{count} imports")
            for (source, target), count in edge_counts.most_common(160)
        ]
        return nodes, edges

    def _build_status(self, root: Path) -> str:
        if (root / "package.json").is_file():
            try:
                scripts = json.loads((root / "package.json").read_text(encoding="utf-8")).get("scripts") or {}
                return "configured" if any(name in scripts for name in ["build", "test", "lint"]) else "not_configured"
            except (json.JSONDecodeError, OSError):
                return "not_configured"
        manifest_names = [
            "pom.xml", "build.gradle", "build.gradle.kts", "pyproject.toml", "requirements.txt",
            "go.mod", "Cargo.toml", "composer.json", "Gemfile",
        ]
        if any((root / name).is_file() for name in manifest_names):
            return "configured"
        if next(root.glob("*.sln"), None) or next(root.glob("*.csproj"), None) or next(root.glob("*/*.csproj"), None):
            return "configured"
        return "not_configured"

    def _coverage_status(self, root: Path) -> str:
        paths = [path.as_posix().lower() for path in root.rglob("*") if path.is_file()]
        if any("coverage" in path for path in paths):
            return "detected"
        if any("/test" in path or ".spec." in path or ".test." in path for path in paths):
            return "tests_detected_no_coverage"
        return "not_configured"

    def _health_score(self, security_count: int, smell_count: int, build_configured: bool, test_configured: bool) -> int:
        score = 100 - (security_count * 12) - (smell_count * 8)
        if not build_configured:
            score -= 12
        if not test_configured:
            score -= 10
        return max(0, min(100, score))

    def _modules(
        self,
        diagnosis: Any,
        api_endpoints: list[EngineeringLabApiEndpoint],
        containers: list[str],
        databases: list[str],
        cloud: list[str],
        build: str,
        coverage: str,
    ) -> list[EngineeringLabModule]:
        security_evidence = [f"{f.path}:{f.line}" if f.line else f.path for f in diagnosis.security_findings]
        smell_evidence = [p for smell in diagnosis.smells for p in smell.related_paths]
        return [
            EngineeringLabModule(id="overview", label="Overview", status="ready", summary="Inventario real gerado a partir dos arquivos do projeto."),
            EngineeringLabModule(id="terminal", label="Terminal", status="ready", summary="Executa comandos reais no backend com cwd restrito ao projeto."),
            EngineeringLabModule(id="api-explorer", label="API Explorer", status="ready" if api_endpoints else "not_configured", summary="Endpoints detectados por OpenAPI/Swagger ou rotas conhecidas.", evidence=[e.source for e in api_endpoints[:10]]),
            EngineeringLabModule(id="security", label="Security Center", status="ready", summary=f"{len(diagnosis.security_findings)} achado(s) reais na varredura local.", evidence=security_evidence[:10]),
            EngineeringLabModule(id="quality", label="Code Quality", status="ready", summary=f"{len(diagnosis.smells)} code smell(s) detectado(s).", evidence=smell_evidence[:10]),
            EngineeringLabModule(id="architecture", label="Architecture", status="ready", summary="Grafo derivado de pastas e imports estáticos."),
            EngineeringLabModule(id="database", label="Database", status="ready" if databases else "not_configured", summary="Bancos detectados por arquivos e dependências.", evidence=databases),
            EngineeringLabModule(id="performance", label="Performance", status="not_configured", summary="Benchmark exige ferramenta externa configurada; nenhum resultado foi inventado."),
            EngineeringLabModule(id="tests", label="Tests", status="ready" if coverage != "not_configured" else "not_configured", summary=f"Status de testes/cobertura: {coverage}."),
            EngineeringLabModule(id="load-test", label="Load Test", status="not_configured", summary="k6, Locust, JMeter ou Artillery ainda não executados."),
            EngineeringLabModule(id="chaos-test", label="Chaos Test", status="unsupported", summary="Simulações destrutivas precisam de ambiente isolado explicitamente configurado."),
            EngineeringLabModule(id="dependencies", label="Dependencies", status="ready", summary="Dependências extraídas dos manifests reais."),
            EngineeringLabModule(id="logs", label="Logs", status="not_configured", summary="Nenhuma fonte de log foi conectada para este projeto."),
            EngineeringLabModule(id="devops", label="DevOps", status="ready" if build == "configured" or containers or cloud else "not_configured", summary="Build, containers e cloud derivados dos arquivos.", evidence=containers + cloud),
            EngineeringLabModule(id="ai-assistant", label="AI Assistant", status="not_configured", summary="Sem provider real selecionado; usar apenas modo determinístico explícito."),
            EngineeringLabModule(id="export", label="Export", status="ready", summary="Relatórios podem ser exportados a partir do payload real do laboratório."),
        ]


engineering_lab_engine = EngineeringLabEngine()
