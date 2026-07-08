from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status

from app.core.config import BASE_DIR
from app.engines.documentation_engine import DocumentationEngine
from app.schemas.functional_completeness import (
    BackendResourceCoverage,
    CompletenessIssue,
    CompletenessStatus,
    FrontendResourceCoverage,
    FunctionalCompletenessReport,
    MobileResourceCoverage,
    ResourceCoverage,
    UiDepthScore,
)

# Build passing is necessary but not sufficient (audit 2026-07-07/08): a live
# generation reached READY with a passing build while shipping a Dashboard-only
# frontend, a Login-only (and non-functional) mobile app, a Java package named
# `interface`, two concurrent backend trees, and entities with raw <<<FILE>>>
# protocol markers pasted into them. Nothing in QualityGateEngine /
# GeneratedProjectQualityEngine checks resource/endpoint coverage -- only file
# *presence*. This engine is a deterministic, sibling gate that does.
#
# Deliberately regex/heuristic, not LLM-judged (matches import_graph_engine.py's
# philosophy): fast, free, reproducible, fully unit-testable. False negatives on
# very unconventional project layouts are possible -- that's why 0 discovered
# resources maps to NEEDS_HUMAN_REVIEW, never a silent pass.

TEXT_EXTENSIONS = {
    ".java", ".json", ".md", ".py", ".properties", ".ts", ".tsx", ".jsx", ".js",
    ".txt", ".xml", ".yaml", ".yml", ".kt", ".cs", ".go",
}

# Full Java keyword + reserved-literal list (JLS). Any of these as a package
# path segment does not compile.
JAVA_RESERVED_WORDS = {
    "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
    "class", "const", "continue", "default", "do", "double", "else", "enum",
    "extends", "final", "finally", "float", "for", "goto", "if", "implements",
    "import", "instanceof", "int", "interface", "long", "native", "new",
    "package", "private", "protected", "public", "return", "short", "static",
    "strictfp", "super", "switch", "synchronized", "this", "throw", "throws",
    "transient", "try", "void", "volatile", "while", "true", "false", "null",
    "var", "record", "yield", "sealed", "permits",
}

_PROTOCOL_MARKERS = ("<<<FILE", "<<<END>>>", "<<<MANIFEST>>>")
_RESOURCE_COVERAGE_THRESHOLD = 80

_JAVA_PACKAGE_DECL_RE = re.compile(r"^\s*package\s+([a-zA-Z0-9_.]+)\s*;", re.MULTILINE)
_JAVA_CLASS_RE = re.compile(r"\bpublic\s+(?:final\s+|abstract\s+)?class\s+(\w+)")
_JAVA_MAPPING_RE = re.compile(r"@(Get|Post|Put|Delete|Patch)Mapping\b")
_JAVA_REQUEST_MAPPING_RE = re.compile(r"@RequestMapping\s*\([^)]*method\s*=\s*RequestMethod\.(\w+)")

# NestJS (TypeScript) discovery -- same precision-favoring philosophy as the Java
# patterns above: require an actual '@nestjs/common' import alongside the
# decorator, not just a bare "@Controller"/"@Injectable" string, to avoid false
# positives on unrelated decorators of the same name in other frameworks.
_TS_CLASS_RE = re.compile(r"\bexport\s+class\s+(\w+)")
_TS_CONTROLLER_DECORATOR_RE = re.compile(r"@Controller\s*\(")
_TS_INJECTABLE_DECORATOR_RE = re.compile(r"@Injectable\s*\(")
_TS_HTTP_METHOD_RE = re.compile(r"@(Get|Post|Put|Delete|Patch)\s*\(")
_NESTJS_IMPORT_RE = re.compile(r"""from\s+['"]@nestjs/common['"]""")
_TS_EXCLUDED_SUFFIXES = (".spec.ts", ".test.ts", ".d.ts", ".spec.js", ".test.js")


def _strip_suffix(name: str, suffix: str) -> str:
    return name[: -len(suffix)] if name.lower().endswith(suffix.lower()) and len(name) > len(suffix) else name


def _backend_resource_score(bc: BackendResourceCoverage) -> int:
    return round(sum([bc.controller, bc.service, bc.repository]) / 3 * 100)


def _frontend_resource_score(fc: FrontendResourceCoverage) -> int:
    return round(sum([fc.listPage, fc.createPage, fc.editPage, fc.detailPage, fc.apiClient, fc.inMenu]) / 6 * 100)


def _mobile_resource_score(mc: MobileResourceCoverage) -> int:
    return round(sum([mc.listScreen, mc.detailScreen, mc.apiClient]) / 3 * 100)


class FunctionalCompletenessEngine:
    def __init__(self) -> None:
        self.workspace_root = BASE_DIR.parents[1].resolve()

    # --------------------------------------------------------------- public

    def evaluate(
        self, project: dict[str, Any], spec: Any = None, *, build_skipped: bool = False
    ) -> FunctionalCompletenessReport:
        root = self._project_root(project)
        issues: list[CompletenessIssue] = []

        resources, backend_issues = self._discover_backend_resources(root)
        issues.extend(backend_issues)
        issues.extend(self._java_safety_checks(root))
        issues.extend(self._protocol_marker_leaks(root))
        issues.extend(self._readme_truth_guard(root))

        frontend_root = self._find_frontend_root(root)
        frontend_completeness, frontend_issues = self._frontend_completeness(root, frontend_root, resources)
        issues.extend(frontend_issues)

        mobile_root = self._find_mobile_root(root)
        mobile_completeness, mobile_issues = self._mobile_completeness(root, mobile_root, resources)
        issues.extend(mobile_issues)

        ui_depth = self._ui_depth_score(frontend_root)

        for resource in resources:
            scores = [_backend_resource_score(resource.backend)]
            if resource.frontend is not None:
                scores.append(_frontend_resource_score(resource.frontend))
            if resource.mobile is not None:
                scores.append(_mobile_resource_score(resource.mobile))
            resource.coverage = round(sum(scores) / len(scores))

        backend_completeness = (
            round(sum(_backend_resource_score(r.backend) for r in resources) / len(resources)) if resources else 0
        )
        report_status, missing_features = self._compute_status(
            resources=resources, issues=issues, build_skipped=build_skipped,
        )

        return FunctionalCompletenessReport(
            project_id=str(project.get("project_id") or ""),
            status=report_status,
            backend_completeness=backend_completeness,
            frontend_completeness=frontend_completeness,
            mobile_completeness=mobile_completeness,
            resources=resources,
            ui_depth=ui_depth,
            issues=issues,
            missing_features=missing_features,
            build_skipped=build_skipped,
            generated_at=datetime.now(UTC).replace(microsecond=0).isoformat(),
        )

    # ------------------------------------------------- backend (Java + NestJS)

    def _discover_backend_resources(self, root: Path) -> tuple[list[ResourceCoverage], list[CompletenessIssue]]:
        java_files = [p for p in root.rglob("*.java") if "node_modules" not in p.parts]
        ts_files = [
            p for p in (*root.rglob("*.ts"), *root.rglob("*.js"))
            if "node_modules" not in p.parts and not p.name.endswith(_TS_EXCLUDED_SUFFIXES)
        ]
        if not java_files and not ts_files:
            return [], []

        # resource -> every file that implements it (not just the last one seen) --
        # tracking every location is what lets us detect the same resource
        # implemented in multiple places below (confirmed live: a real NestJS +
        # Next.js project had the same domain controller duplicated across 4
        # different directory conventions, only one of them actually wired up).
        controllers: dict[str, list[dict[str, Any]]] = {}
        services: set[str] = set()
        repositories: set[str] = set()
        ts_resources: set[str] = set()

        for path in java_files:
            text = self._safe_read(path)
            class_match = _JAVA_CLASS_RE.search(text)
            class_name = class_match.group(1) if class_match else path.stem
            if "@RestController" in text or "@Controller" in text:
                resource = _strip_suffix(class_name, "Controller")
                methods = {m.group(1).upper() for m in _JAVA_MAPPING_RE.finditer(text)}
                methods |= {m.group(1).upper() for m in _JAVA_REQUEST_MAPPING_RE.finditer(text)}
                controllers.setdefault(resource, []).append(
                    {"file": str(path.relative_to(root)), "endpoints": methods}
                )
            elif "@Service" in text:
                services.add(_strip_suffix(class_name, "Service").lower())
            elif "@Repository" in text:
                repositories.add(_strip_suffix(class_name, "Repository").lower())

        for path in ts_files:
            text = self._safe_read(path)
            if not _NESTJS_IMPORT_RE.search(text):
                continue
            class_match = _TS_CLASS_RE.search(text)
            class_name = class_match.group(1) if class_match else path.stem
            if _TS_CONTROLLER_DECORATOR_RE.search(text):
                resource = _strip_suffix(class_name, "Controller")
                methods = {m.group(1).upper() for m in _TS_HTTP_METHOD_RE.finditer(text)}
                controllers.setdefault(resource, []).append(
                    {"file": str(path.relative_to(root)), "endpoints": methods}
                )
                ts_resources.add(resource)
            elif _TS_INJECTABLE_DECORATOR_RE.search(text) and class_name.endswith("Service"):
                services.add(_strip_suffix(class_name, "Service").lower())

        issues: list[CompletenessIssue] = []
        resources: list[ResourceCoverage] = []
        for resource, entries in controllers.items():
            if len(entries) > 1:
                files = [e["file"] for e in entries]
                issues.append(CompletenessIssue(
                    id=f"duplicate_resource_implementation_{resource}",
                    title=f"Resource '{resource}' has controllers in multiple locations",
                    severity="BLOCKER", category="structure", file=files[0],
                    detail=(
                        f"Found {len(entries)} separate controller implementations for '{resource}': "
                        f"{files}. Only one implementation should exist -- pick one directory convention."
                    ),
                ))
            endpoints: set[str] = set()
            for entry in entries:
                endpoints |= entry["endpoints"]
            has_service = resource.lower() in services
            has_repository = resource.lower() in repositories
            is_ts_resource = resource in ts_resources
            if not has_service:
                issues.append(CompletenessIssue(
                    id=f"backend_no_service_{resource}", title=f"Controller '{resource}' has no matching Service",
                    severity="WARNING", category="backend", file=entries[0]["file"],
                    detail=f"No service class found for resource '{resource}'.",
                ))
            elif not has_repository and not is_ts_resource:
                # Java-only warning: Prisma/TypeORM-in-service (no separate
                # repository layer) is a common, legitimate NestJS pattern, not a
                # gap -- flagging it for TS resources would be a false positive.
                issues.append(CompletenessIssue(
                    id=f"backend_no_repository_{resource}", title=f"Service for '{resource}' has no matching Repository",
                    severity="WARNING", category="backend", file=entries[0]["file"],
                    detail=f"No @Repository class found for resource '{resource}'.",
                ))
            resources.append(ResourceCoverage(
                resource=resource,
                backend=BackendResourceCoverage(
                    controller=True, service=has_service, repository=has_repository,
                    endpoints=sorted(endpoints),
                ),
            ))
        return resources, issues

    def _java_safety_checks(self, root: Path) -> list[CompletenessIssue]:
        issues: list[CompletenessIssue] = []
        java_files = [p for p in root.rglob("*.java") if "node_modules" not in p.parts]
        spring_app_files: list[Path] = []
        for path in java_files:
            text = self._safe_read(path)
            match = _JAVA_PACKAGE_DECL_RE.search(text)
            if match:
                segments = match.group(1).split(".")
                bad = [s for s in segments if s.lower() in JAVA_RESERVED_WORDS]
                if bad:
                    issues.append(CompletenessIssue(
                        id=f"java_reserved_package_{path.name}", title="Java package uses a reserved word",
                        severity="BLOCKER", category="java_safety", file=str(path.relative_to(root)),
                        detail=(
                            f"Package declaration '{match.group(1)}' uses reserved word(s) {bad} as a "
                            "segment; this does not compile."
                        ),
                    ))
            if "@SpringBootApplication" in text:
                spring_app_files.append(path)

        if len(spring_app_files) > 1:
            issues.append(CompletenessIssue(
                id="java_duplicate_application", title="Multiple @SpringBootApplication entrypoints found",
                severity="BLOCKER", category="java_safety", file=None,
                detail=(
                    f"Found {len(spring_app_files)} Spring Boot application entrypoints: "
                    f"{[str(p.relative_to(root)) for p in spring_app_files]}. Only one backend tree is allowed."
                ),
            ))

        issues.extend(self._duplicate_backend_tree_check(root))
        return issues

    def _duplicate_backend_tree_check(self, root: Path) -> list[CompletenessIssue]:
        manifests = list(root.rglob("pom.xml")) + list(root.rglob("build.gradle")) + list(root.rglob("build.gradle.kts"))
        candidate_roots = sorted(
            {p.parent for p in manifests if (p.parent / "src" / "main" / "java").is_dir()},
            key=lambda p: p.as_posix(),
        )
        # Nested parent/child manifests are a legitimate multi-module Maven/Gradle
        # build, not a duplicate concurrent tree -- only flag independent roots.
        top_level = [d for d in candidate_roots if not any(other != d and other in d.parents for other in candidate_roots)]
        if len(top_level) > 1:
            return [CompletenessIssue(
                id="java_duplicate_backend_tree", title="Multiple concurrent backend source trees detected",
                severity="BLOCKER", category="java_safety", file=None,
                detail=f"Found {len(top_level)} independent backend module roots: {[str(d.relative_to(root)) for d in top_level]}.",
            )]
        return []

    def _protocol_marker_leaks(self, root: Path) -> list[CompletenessIssue]:
        issues: list[CompletenessIssue] = []
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in TEXT_EXTENSIONS or "node_modules" in path.parts:
                continue
            text = self._safe_read(path)
            for marker in _PROTOCOL_MARKERS:
                if marker in text:
                    issues.append(CompletenessIssue(
                        id=f"protocol_marker_leak_{path.as_posix()}",
                        title="Generation protocol marker leaked into a generated file",
                        severity="BLOCKER", category="content_integrity", file=str(path.relative_to(root)),
                        detail=f"File contains a raw '{marker}' token; file-protocol content leaked into real source.",
                    ))
                    break
        return issues

    def _readme_truth_guard(self, root: Path) -> list[CompletenessIssue]:
        doc_engine = DocumentationEngine()
        index = doc_engine._file_index(root)  # noqa: SLF001 -- deliberate reuse, see plan
        readme_rel = index.get("readme.md")
        if not readme_rel:
            return []
        content = self._safe_read(root / readme_rel)
        signals = doc_engine._project_signals(root, index)  # noqa: SLF001
        inconsistencies = doc_engine._scan_consistency(content, signals)  # noqa: SLF001
        return [
            CompletenessIssue(
                id=f"readme_truth_{index_}", title="README references something that doesn't exist in the project",
                severity="BLOCKER", category="documentation", file=readme_rel, detail=message,
            )
            for index_, message in enumerate(inconsistencies)
        ]

    # ------------------------------------------------------------ frontend

    def _find_frontend_root(self, root: Path) -> Path | None:
        for candidate in (root / "apps" / "web", root / "apps" / "frontend"):
            if candidate.is_dir() and (candidate / "package.json").is_file():
                return candidate
        if (root / "package.json").is_file():
            return root
        return None

    def _frontend_completeness(
        self, root: Path, frontend_root: Path | None, resources: list[ResourceCoverage],
    ) -> tuple[int | None, list[CompletenessIssue]]:
        if frontend_root is None:
            return None, []

        def _excluded(path: Path) -> bool:
            posix = f"/{path.as_posix()}/"
            return "/node_modules/" in posix or "/apps/mobile/" in posix

        page_files = [p for p in frontend_root.rglob("*") if p.is_file() and p.suffix in {".tsx", ".jsx"} and not _excluded(p)]
        nav_files = [p for p in page_files if any(tok in p.name.lower() for tok in ("nav", "menu", "sidebar"))]
        nav_text = "\n".join(self._safe_read(p) for p in nav_files).lower()
        api_files = [
            p for p in frontend_root.rglob("*")
            if p.is_file() and p.suffix in {".ts", ".tsx"} and not _excluded(p) and "api" in p.as_posix().lower()
        ]
        api_text = "\n".join(self._safe_read(p) for p in api_files).lower()

        covered_any = False
        for resource in resources:
            needle = resource.resource.lower()
            resource_pages = [p for p in page_files if needle in p.as_posix().lower()]
            if resource_pages:
                covered_any = True
            resource.frontend = FrontendResourceCoverage(
                listPage=any(not re.search(r"(new|create|edit|\[id]|detail)", p.as_posix(), re.IGNORECASE) for p in resource_pages),
                createPage=any(re.search(r"(new|create)", p.as_posix(), re.IGNORECASE) for p in resource_pages),
                editPage=any(re.search(r"edit", p.as_posix(), re.IGNORECASE) for p in resource_pages),
                detailPage=any(re.search(r"(\[id]|detail)", p.as_posix(), re.IGNORECASE) for p in resource_pages),
                apiClient=needle in api_text,
                inMenu=needle in nav_text,
            )

        issues: list[CompletenessIssue] = []
        if resources and not covered_any:
            issues.append(CompletenessIssue(
                id="frontend_incomplete_dashboard_only", title="Frontend does not cover any backend resource",
                severity="BLOCKER" if len(resources) >= 2 else "WARNING", category="frontend", file=None,
                detail=(
                    f"Backend exposes {len(resources)} resource(s) "
                    f"({', '.join(r.resource for r in resources)}) but no frontend page references any of "
                    "them (frontend appears to be Dashboard-only)."
                ),
            ))

        scores = [_frontend_resource_score(r.frontend) for r in resources if r.frontend is not None]
        completeness = round(sum(scores) / len(scores)) if scores else None
        return completeness, issues

    # --------------------------------------------------------------- mobile

    def _find_mobile_root(self, root: Path) -> Path | None:
        for candidate in (root / "apps" / "mobile", root / "mobile"):
            if candidate.is_dir():
                return candidate
        return None

    def _mobile_completeness(
        self, root: Path, mobile_root: Path | None, resources: list[ResourceCoverage],
    ) -> tuple[int | None, list[CompletenessIssue]]:
        if mobile_root is None:
            return None, []

        all_files = [
            p for p in mobile_root.rglob("*")
            if p.is_file() and p.suffix in {".tsx", ".ts", ".jsx", ".js"} and "node_modules" not in p.parts
        ]
        login_files = [p for p in all_files if "login" in p.name.lower()]
        auth_context_files = [
            p for p in all_files
            if "authcontext" in p.name.lower().replace("_", "").replace("-", "")
            or "authprovider" in p.name.lower().replace("_", "").replace("-", "")
        ]
        screen_files = [p for p in all_files if "screen" in p.as_posix().lower()]
        api_files = [p for p in all_files if "api" in p.as_posix().lower()]

        auth_text = "\n".join(self._safe_read(p) for p in login_files + auth_context_files)
        has_token_storage = bool(re.search(
            r"SecureStore\.setItemAsync|AsyncStorage\.setItem|\.setItem\(\s*['\"](?:token|access_?token|auth_?token)",
            auth_text, re.IGNORECASE,
        ))
        api_text = "\n".join(self._safe_read(p) for p in api_files).lower()

        issues: list[CompletenessIssue] = []
        if login_files and not has_token_storage:
            issues.append(CompletenessIssue(
                id="mobile_login_no_token_storage", title="Mobile login does not persist an auth token",
                severity="BLOCKER", category="mobile", file=str(login_files[0].relative_to(root)),
                detail=(
                    "A login screen exists but no token-storage call (SecureStore/AsyncStorage) was found "
                    "nearby; login likely does not actually authenticate the user."
                ),
            ))

        non_login_screens = [p for p in screen_files if "login" not in p.name.lower()]
        if resources and not non_login_screens:
            issues.append(CompletenessIssue(
                id="mobile_login_only", title="Mobile app only has a Login screen",
                severity="BLOCKER" if len(resources) >= 2 else "WARNING", category="mobile", file=None,
                detail=f"Backend exposes {len(resources)} resource(s) but the mobile app has no screens beyond login.",
            ))

        for resource in resources:
            needle = resource.resource.lower()
            resource_screens = [p for p in screen_files if needle in p.as_posix().lower()]
            resource.mobile = MobileResourceCoverage(
                listScreen=bool(resource_screens),
                detailScreen=any(re.search(r"(detail|\[id])", p.as_posix(), re.IGNORECASE) for p in resource_screens),
                apiClient=needle in api_text,
            )

        scores = [_mobile_resource_score(r.mobile) for r in resources if r.mobile is not None]
        if scores:
            completeness = round(sum(scores) / len(scores))
        else:
            completeness = 100 if (login_files and has_token_storage and auth_context_files) else 0
        return completeness, issues

    # ------------------------------------------------------------- UI depth

    def _ui_depth_score(self, frontend_root: Path | None) -> UiDepthScore:
        if frontend_root is None:
            return UiDepthScore()
        page_files = [
            p for p in frontend_root.rglob("*")
            if p.is_file() and p.suffix in {".tsx", ".jsx"}
            and "/node_modules/" not in f"/{p.as_posix()}/" and "/apps/mobile/" not in f"/{p.as_posix()}/"
        ]
        text = "\n".join(self._safe_read(p) for p in page_files)
        page_count = len(page_files)
        form_count = len(re.findall(r"<form\b|onSubmit\s*=", text, re.IGNORECASE))
        list_count = len(re.findall(r"<table\b|\.map\(\s*\(", text))
        api_call_count = len(re.findall(r"\bfetch\(|axios\.|apiClient\.|useQuery\(|useMutation\(", text))
        loading_hits = len(re.findall(r"isLoading|loading\s*:|<Spinner|<Skeleton", text, re.IGNORECASE))
        error_hits = len(re.findall(r"isError|error\s*:|<ErrorMessage|catch\s*\(", text, re.IGNORECASE))
        empty_hits = len(re.findall(r"empty.?state|no.{0,15}(found|results)|nenhum", text, re.IGNORECASE))
        nav_count = len(re.findall(r"<Link\b|href\s*=|router\.push", text))
        has_auth_guard = bool(re.search(r"useAuth\(|AuthGuard|withAuth|middleware", text))
        components = [
            min(100, page_count * 10), min(100, form_count * 15), min(100, list_count * 15),
            min(100, api_call_count * 5), 100 if loading_hits else 0, 100 if error_hits else 0,
            100 if empty_hits else 0, 100 if nav_count else 0, 100 if has_auth_guard else 0,
        ]
        return UiDepthScore(
            page_count=page_count, form_count=form_count, list_or_table_count=list_count,
            api_call_count=api_call_count, loading_state_hits=loading_hits, error_state_hits=error_hits,
            empty_state_hits=empty_hits, nav_link_count=nav_count, has_auth_guard=has_auth_guard,
            score=round(sum(components) / len(components)),
        )

    # ------------------------------------------------------------- status

    def _compute_status(
        self, *, resources: list[ResourceCoverage], issues: list[CompletenessIssue], build_skipped: bool,
    ) -> tuple[CompletenessStatus, list[str]]:
        blockers = [issue for issue in issues if issue.severity == "BLOCKER"]
        if blockers:
            return "BLOCKED", [issue.title for issue in blockers]

        if not resources:
            return "NEEDS_HUMAN_REVIEW", [
                "Resource discovery did not find any backend controllers for this stack; "
                "functional completeness could not be verified automatically.",
            ]

        missing_features: list[str] = []
        avg_coverage = round(sum(r.coverage for r in resources) / len(resources))
        if avg_coverage < _RESOURCE_COVERAGE_THRESHOLD:
            missing_features.append(f"Average resource coverage is {avg_coverage}% (threshold: {_RESOURCE_COVERAGE_THRESHOLD}%).")
        if build_skipped:
            missing_features.append(
                "Build only reached READY via the bounded auto-repair fallback (SKIPPED_AFTER_FAILURE), not a clean pass.",
            )

        if missing_features:
            return "PARTIALLY_VERIFIED", missing_features
        return "VERIFIED", []

    # ------------------------------------------------------------- helpers

    def _project_root(self, project: dict[str, Any]) -> Path:
        raw_path = project.get("generated_project_path")
        if not raw_path:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Project has no generated project path.")
        root = Path(str(raw_path)).resolve()
        if not root.exists() or not root.is_dir():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generated project path does not exist.")
        if root == self.workspace_root or self.workspace_root not in root.parents:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Generated project path must stay inside workspace.")
        return root

    @staticmethod
    def _safe_read(path: Path) -> str:
        try:
            return path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return ""


functional_completeness_engine = FunctionalCompletenessEngine()
