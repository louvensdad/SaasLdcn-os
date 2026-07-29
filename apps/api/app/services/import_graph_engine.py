from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any

# Import Graph Engine v1 (TS/JS only — see [[stack-lock-pre-generation]] memory
# for why Java/Python were deferred): a static, regex-based reader of the
# import statements the generation job actually emitted, cross-checked against
# the manifests emitted in the same job. Report-only by design (the user chose
# this over hard-blocking): a regex parser can false-positive on syntax it
# doesn't recognize, and the real compiler/bundler in BUILD_RUNNING is already
# the authoritative gate for "does this actually resolve". This engine's value
# is catching three things the compiler does NOT flag on its own:
#   - undeclared external packages (imported but missing from any manifest)
#   - cross-stack leakage (apps/web importing straight from apps/api, etc.)
#   - broken aliases/relative paths, surfaced early instead of at the end

_JS_EXTENSIONS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")
_NON_SOURCE_EXTENSIONS = (
    ".css", ".scss", ".sass", ".less", ".json", ".svg", ".png", ".jpg", ".jpeg",
    ".gif", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".txt", ".md",
)
_CANDIDATE_SUFFIXES = ("", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx")

_NODE_BUILTINS = {
    "assert", "buffer", "child_process", "cluster", "crypto", "dgram", "dns", "events",
    "fs", "http", "http2", "https", "net", "os", "path", "process", "punycode",
    "querystring", "readline", "stream", "string_decoder", "timers", "tls", "tty",
    "url", "util", "v8", "vm", "worker_threads", "zlib", "module", "perf_hooks",
}

_MANIFEST_SECTIONS = ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies")

# import x from '...'; import '...'; export ... from '...'; require('...'); import('...')
_IMPORT_RE = re.compile(
    r"""(?:
        import\s+(?:[\w${}\s,*]+\s+from\s+)?['"]([^'"]+)['"]
      | export\s+(?:[\w${}\s,*]+\s+from\s+)?['"]([^'"]+)['"]
      | require\(\s*['"]([^'"]+)['"]\s*\)
      | import\(\s*['"]([^'"]+)['"]\s*\)
    )""",
    re.VERBOSE,
)


@dataclass(frozen=True)
class ImportEdge:
    source_file: str
    specifier: str
    kind: str  # "internal" | "alias" | "external"
    resolved: str | None
    status: str  # "resolved" | "unresolved_internal" | "undeclared_external" | "cross_stack_leakage"
    detail: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "source_file": self.source_file, "specifier": self.specifier, "kind": self.kind,
            "resolved": self.resolved, "status": self.status, "detail": self.detail,
        }


def is_js_file(path: str) -> bool:
    return path.lower().endswith(_JS_EXTENSIONS)


def extract_imports(content: str) -> list[str]:
    specs: list[str] = []
    for match in _IMPORT_RE.finditer(content):
        spec = next((group for group in match.groups() if group), None)
        if spec:
            specs.append(spec)
    return specs


def app_root(path: str) -> str | None:
    parts = PurePosixPath(path).parts
    if len(parts) >= 2 and parts[0] == "apps":
        return f"{parts[0]}/{parts[1]}"
    return None


def manifest_app_root(manifest_name: str) -> str | None:
    """'apps/web/package.json' -> 'apps/web'; top-level 'package.json' -> None (global)."""
    if manifest_name == "package.json":
        return None
    if manifest_name.endswith("/package.json"):
        return manifest_name[: -len("/package.json")]
    return None


def _classify(spec: str) -> str:
    if spec.startswith("."):
        return "internal"
    if spec.startswith("@/"):
        return "alias"
    return "external"


def _is_non_source(spec: str) -> bool:
    return spec.lower().endswith(_NON_SOURCE_EXTENSIONS)


def _external_package_name(spec: str) -> str:
    parts = spec.split("/")
    if spec.startswith("@") and len(parts) >= 2:
        return "/".join(parts[:2])
    return parts[0]


def _resolve_relative(source_file: str, spec: str) -> str:
    base = PurePosixPath(source_file).parent
    combined = base.joinpath(spec) if not spec.startswith("/") else PurePosixPath(spec.lstrip("/"))
    parts: list[str] = []
    for part in combined.parts:
        if part == "..":
            if parts:
                parts.pop()
        elif part in (".", ""):
            continue
        else:
            parts.append(part)
    return "/".join(parts)


def _resolve_alias(spec: str, source_app: str | None) -> str:
    # Convention: '@/x' -> '{app_root}/src/x' (Next.js/Vite default 'paths': {"@/*": ["./src/*"]}).
    rest = spec[len("@/"):]
    prefix = f"{source_app}/src" if source_app else "src"
    return f"{prefix}/{rest}"


def _find_file(resolved: str, file_set: set[str]) -> str | None:
    for suffix in _CANDIDATE_SUFFIXES:
        candidate = resolved + suffix
        if candidate in file_set:
            return candidate
    return None


def _package_declared(package: str, source_app: str | None, manifests: dict[str, dict[str, Any]]) -> bool:
    if package in _NODE_BUILTINS or package.startswith("node:"):
        return True
    candidates = [manifests[source_app]] if source_app in manifests else list(manifests.values())
    for data in candidates:
        if not isinstance(data, dict):
            continue
        for section in _MANIFEST_SECTIONS:
            deps = data.get(section)
            if isinstance(deps, dict) and package in deps:
                return True
    return False


def build_import_graph(files: dict[str, str], manifests: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """files: {path: content} for every generated JS/TS source file emitted so
    far in the job. manifests: {app_root: parsed package.json} (app_root=None
    key holds a root-level manifest, if any)."""
    file_set = set(files)
    edges: list[ImportEdge] = []
    external_packages: set[str] = set()

    for source_file, content in sorted(files.items()):
        if not is_js_file(source_file):
            continue
        source_app = app_root(source_file)
        for spec in extract_imports(content):
            if _is_non_source(spec):
                continue
            kind = _classify(spec)
            if kind == "external":
                package = _external_package_name(spec)
                external_packages.add(package)
                declared = _package_declared(package, source_app, manifests)
                edges.append(ImportEdge(
                    source_file=source_file, specifier=spec, kind="external", resolved=package,
                    status="resolved" if declared else "undeclared_external",
                    detail="" if declared else (
                        f"'{package}' importado em {source_file} mas nao declarado em nenhum manifest "
                        f"de {source_app or 'projeto'}."
                    ),
                ))
                continue
            resolved = _resolve_relative(source_file, spec) if kind == "internal" else _resolve_alias(spec, source_app)
            match = _find_file(resolved, file_set)
            if match is None:
                edges.append(ImportEdge(
                    source_file=source_file, specifier=spec, kind=kind, resolved=resolved,
                    status="unresolved_internal",
                    detail=f"'{spec}' em {source_file} nao resolve para nenhum arquivo gerado ({resolved}).",
                ))
                continue
            target_app = app_root(match)
            if source_app and target_app and source_app != target_app:
                edges.append(ImportEdge(
                    source_file=source_file, specifier=spec, kind=kind, resolved=match,
                    status="cross_stack_leakage",
                    detail=f"'{source_file}' ({source_app}) importa diretamente de '{target_app}'; apps nao devem importar uns aos outros.",
                ))
                continue
            edges.append(ImportEdge(source_file=source_file, specifier=spec, kind=kind, resolved=match, status="resolved"))

    conflicts = [edge for edge in edges if edge.status != "resolved"]
    return {
        "nodes": sorted(file_set),
        "edges": [edge.as_dict() for edge in edges],
        "external_packages": sorted(external_packages),
        "conflicts": [edge.as_dict() for edge in conflicts],
    }
