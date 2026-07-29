from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from app.data.foundation import CONTRACT_VERSION

# Runtime profile for an EXISTING codebase, computed by READING the code only —
# the legacy project is NEVER executed (untrusted upload; the ingestor's posture is
# "no execution"). Metrics are split honestly:
#   - measured : computed from the real files (deps, entry points, routes, I/O,
#                concurrency signals, container/build tooling).
#   - estimate : a heuristic band with its basis stated (install footprint, cold
#                start, memory baseline). Never presented as a measurement.

_SCAN_FILE_CAP = 600        # max source files read for signal scanning
_SCAN_BYTE_CAP = 6 * 1024 * 1024  # max bytes read while scanning

_ENTRY_NAMES = {
    "main.py", "app.py", "manage.py", "wsgi.py", "asgi.py", "main.ts", "main.js",
    "index.ts", "index.js", "server.ts", "server.js", "main.go", "program.cs",
}
_ENTRY_SUFFIX = ("application.java",)  # *Application.java (Spring)

_MANIFEST_NAMES = {
    "package.json", "requirements.txt", "pyproject.toml", "pom.xml", "build.gradle",
    "build.gradle.kts", "go.mod", "cargo.toml", "composer.json",
}

_ROUTE_RE = re.compile(
    r"@\w*\.?(get|post|put|delete|patch|route)\s*\(|"
    r"@(Get|Post|Put|Delete|Patch|Request)Mapping|"
    r"\b(app|router|blueprint|r)\.(get|post|put|delete|patch)\s*\(|"
    r"\.(GET|POST|PUT|DELETE|HandleFunc)\s*\(",
)
_IO_RE = re.compile(
    r"requests\.|httpx\.|\bfetch\s*\(|axios\.|HttpClient|RestTemplate|WebClient|"
    r"jdbc:|cursor\.execute|session\.query|repository\.|\.findBy|os\.open|ioutil\.|fs\.read",
    re.IGNORECASE,
)
_ASYNC_RE = re.compile(r"\basync\b|\bawait\b|asyncio|Promise\.all|CompletableFuture|@Async")
_THREAD_RE = re.compile(r"threading|Thread\s*\(|ExecutorService|new\s+Thread|std::thread|sync\.WaitGroup")
_GOROUTINE_RE = re.compile(r"\bgo\s+func|\bgo\s+\w+\(")
_MULTIPROC_RE = re.compile(r"multiprocessing")


class RuntimeProfileEngine:
    def profile(self, ingest_id: str, service: Any, inventory: Any, diagnosis: Any, stats: Any) -> dict[str, Any]:
        root = service.root_for(ingest_id)
        language = str(getattr(diagnosis, "primary_language", "") or "unknown")
        frameworks = list(getattr(stats, "frameworks", []) or [])
        lines = int(getattr(stats, "lines_of_code", 0) or 0)
        files = list(getattr(inventory, "files", []) or [])
        file_count = int(getattr(inventory, "file_count", len(files)) or 0)
        paths = [str(getattr(f, "path", "")) for f in files]

        manifests = self._read_manifests(root, paths)
        deps = self._count_deps(manifests)
        runtime = self._runtime_version(language, frameworks, manifests)
        entry_points = sum(1 for p in paths if self._is_entry(p))
        container_ready = any(re.search(r"(^|/)(dockerfile|docker-compose\.ya?ml|compose\.ya?ml)$", p, re.I) for p in paths)
        largest = max(files, key=lambda f: int(getattr(f, "size_bytes", 0) or 0), default=None)
        signals = self._scan_signals(root, paths)
        concurrency = self._concurrency_model(signals, language)

        m = self._metric
        metrics = [
            m("loc", "Linhas de código", f"{lines:,}".replace(",", "."), "measured", "Contadas pelo Smart Ingest."),
            m("modules", "Módulos (arquivos)", str(file_count), "measured", "Arquivos relevantes indexados."),
            m("deps", "Dependências", str(deps) if deps is not None else "—", "measured",
              "Declaradas nos manifestos (package.json/requirements/pom/go.mod/…)." if deps is not None else "Nenhum manifesto de dependências detectado."),
            m("entrypoints", "Pontos de entrada", str(entry_points), "measured", "main/app/index/Application detectados por nome."),
            m("endpoints", "Rotas / endpoints", str(signals["routes"]), "measured", "Declarações de rota detectadas no código real."),
            m("concurrency", "Modelo de concorrência", concurrency, "measured", "async/threads/goroutines detectados no código."),
            m("io", "Superfície de I/O", str(signals["io"]), "measured", "Chamadas de banco/HTTP/arquivo detectadas."),
            m("container", "Container", "Pronto" if container_ready else "Ausente", "measured",
              "Dockerfile/compose detectado no inventário." if container_ready else "Nenhum Dockerfile/compose detectado."),
            m("footprint", "Footprint de instalação", self._footprint_band(deps), "estimate", "Banda heurística por nº de dependências."),
            m("coldstart", "Cold start", self._coldstart_band(language, frameworks), "estimate", "Heurística por runtime/framework."),
            m("memory", "Memória baseline", self._memory_band(language, frameworks), "estimate", "Heurística por runtime/framework."),
        ]
        if largest is not None:
            metrics.insert(8, m("largest", "Maior módulo", f"{getattr(largest, 'path', '?')} · {self._kb(int(getattr(largest, 'size_bytes', 0) or 0))}", "measured", "Maior arquivo do inventário."))

        return {
            "contractVersion": CONTRACT_VERSION,
            "runtime": runtime,
            "language": language,
            "container_ready": container_ready,
            "executed": False,
            "metrics": metrics,
            "notes": [
                "O código legado NÃO é executado (segurança). Métricas 'Medido' vêm da análise estática real; 'Estimativa' são heurísticas com base declarada.",
                "CPU/RAM/latência sob carga só existem executando o projeto — por isso aparecem como estimativa, nunca como medição.",
            ],
        }

    # ---------------------------------------------------------------- manifests

    def _read_manifests(self, root: Path, paths: list[str]) -> dict[str, str]:
        out: dict[str, str] = {}
        for p in paths:
            name = p.rsplit("/", 1)[-1].lower()
            if name in _MANIFEST_NAMES and name not in out:
                try:
                    out[name] = (root / p).read_text(encoding="utf-8", errors="ignore")
                except OSError:
                    continue
        return out

    def _count_deps(self, manifests: dict[str, str]) -> int | None:
        total = 0
        found = False
        if "package.json" in manifests:
            found = True
            try:
                data = json.loads(manifests["package.json"])
                total += len(data.get("dependencies") or {}) + len(data.get("devDependencies") or {})
            except json.JSONDecodeError:
                pass
        if "requirements.txt" in manifests:
            found = True
            total += sum(
                1 for line in manifests["requirements.txt"].splitlines()
                if line.strip() and not line.strip().startswith(("#", "-"))
            )
        if "pyproject.toml" in manifests:
            found = True
            total += self._count_toml_deps(manifests["pyproject.toml"])
        if "pom.xml" in manifests:
            found = True
            total += len(re.findall(r"<dependency>", manifests["pom.xml"]))
        for gradle in ("build.gradle", "build.gradle.kts"):
            if gradle in manifests:
                found = True
                total += len(re.findall(r"\b(implementation|api|compileOnly|runtimeOnly|testImplementation)\b", manifests[gradle]))
        if "go.mod" in manifests:
            found = True
            total += self._count_gomod_deps(manifests["go.mod"])
        if "cargo.toml" in manifests:
            found = True
            total += self._count_toml_deps(manifests["cargo.toml"])
        if "composer.json" in manifests:
            found = True
            try:
                data = json.loads(manifests["composer.json"])
                total += len(data.get("require") or {}) + len(data.get("require-dev") or {})
            except json.JSONDecodeError:
                pass
        return total if found else None

    def _count_toml_deps(self, content: str) -> int:
        count = 0
        in_block = False
        for line in content.splitlines():
            stripped = line.strip()
            if stripped.startswith("["):
                in_block = "dependencies" in stripped.lower()
                continue
            if in_block and re.match(r"^[\"']?[A-Za-z0-9_.\-]+[\"']?\s*[=:]", stripped):
                count += 1
        return count

    def _count_gomod_deps(self, content: str) -> int:
        count = 0
        in_block = False
        for line in content.splitlines():
            stripped = line.strip()
            if stripped.startswith("require ("):
                in_block = True
                continue
            if in_block:
                if stripped == ")":
                    in_block = False
                elif stripped:
                    count += 1
            elif stripped.startswith("require "):
                count += 1
        return count

    def _runtime_version(self, language: str, frameworks: list[str], manifests: dict[str, str]) -> str:
        if "go.mod" in manifests:
            match = re.search(r"^go\s+([0-9.]+)", manifests["go.mod"], re.MULTILINE)
            return f"Go {match.group(1)}" if match else "Go"
        if "package.json" in manifests:
            try:
                node = (json.loads(manifests["package.json"]).get("engines") or {}).get("node")
            except json.JSONDecodeError:
                node = None
            return f"Node {node}" if node else "Node.js"
        if "pom.xml" in manifests:
            match = re.search(r"<(?:java\.version|maven\.compiler\.(?:source|release))>([^<]+)<", manifests["pom.xml"])
            return f"JVM {match.group(1)}" if match else "JVM"
        if "pyproject.toml" in manifests or "requirements.txt" in manifests:
            blob = manifests.get("pyproject.toml", "")
            match = re.search(r"python\s*=\s*[\"']?[><=^~]*\s*([0-9.]+)", blob)
            return f"Python {match.group(1)}" if match else "Python"
        return language.capitalize() if language and language != "unknown" else "Desconhecido"

    # ------------------------------------------------------------------ signals

    def _scan_signals(self, root: Path, paths: list[str]) -> dict[str, int]:
        routes = io = asyncs = threads = goroutines = multiproc = 0
        read = 0
        scanned_bytes = 0
        for p in paths:
            if read >= _SCAN_FILE_CAP or scanned_bytes >= _SCAN_BYTE_CAP:
                break
            if not p.lower().endswith((".py", ".java", ".kt", ".ts", ".tsx", ".js", ".jsx", ".go", ".cs", ".rb", ".php", ".rs", ".scala")):
                continue
            try:
                text = (root / p).read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            read += 1
            scanned_bytes += len(text)
            routes += len(_ROUTE_RE.findall(text))
            io += len(_IO_RE.findall(text))
            asyncs += len(_ASYNC_RE.findall(text))
            threads += len(_THREAD_RE.findall(text))
            goroutines += len(_GOROUTINE_RE.findall(text))
            multiproc += len(_MULTIPROC_RE.findall(text))
        return {
            "routes": routes, "io": io, "async": asyncs,
            "threads": threads, "goroutines": goroutines, "multiproc": multiproc,
        }

    def _concurrency_model(self, signals: dict[str, int], language: str) -> str:
        if signals["goroutines"] >= 1:
            return "Goroutines"
        scores = {
            "async/await": signals["async"],
            "threads/pool": signals["threads"],
            "multiprocesso": signals["multiproc"],
        }
        best = max(scores, key=lambda k: scores[k])
        if scores[best] == 0:
            return "Síncrono"
        return best

    # ---------------------------------------------------------------- estimates

    def _footprint_band(self, deps: int | None) -> str:
        if deps is None:
            return "Indeterminado"
        if deps < 20:
            return "Pequeno (< 20 deps)"
        if deps < 80:
            return "Médio (20–80 deps)"
        return "Grande (80+ deps)"

    def _coldstart_band(self, language: str, frameworks: list[str]) -> str:
        fw = " ".join(frameworks).lower()
        lang = language.lower()
        if "spring" in fw or lang in {"java", "kotlin", "scala"}:
            return "Alto (warmup de JVM)"
        if lang in {"go", "rust", "c", "cpp"}:
            return "Baixo (binário nativo)"
        if lang in {"python", "javascript", "typescript", "ruby", "php"}:
            return "Médio (interpretado)"
        return "Indeterminado"

    def _memory_band(self, language: str, frameworks: list[str]) -> str:
        fw = " ".join(frameworks).lower()
        lang = language.lower()
        if "spring" in fw or lang in {"java", "kotlin", "scala"}:
            return "Alta (JVM)"
        if lang in {"go", "rust", "c", "cpp"}:
            return "Baixa (nativo)"
        return "Média (runtime gerenciado)"

    # ------------------------------------------------------------------ helpers

    def _is_entry(self, path: str) -> bool:
        name = path.rsplit("/", 1)[-1].lower()
        return name in _ENTRY_NAMES or name.endswith(_ENTRY_SUFFIX)

    def _kb(self, size_bytes: int) -> str:
        if size_bytes < 1024:
            return f"{size_bytes} B"
        if size_bytes < 1024 * 1024:
            return f"{size_bytes / 1024:.1f} KB"
        return f"{size_bytes / (1024 * 1024):.1f} MB"

    def _metric(self, metric_id: str, label: str, value: str, kind: str, basis: str) -> dict[str, Any]:
        return {"id": metric_id, "label": label, "value": value, "kind": kind, "basis": basis}


runtime_profile_engine = RuntimeProfileEngine()
