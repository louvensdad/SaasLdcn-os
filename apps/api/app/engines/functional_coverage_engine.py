from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path

from app.schemas.functional_completeness import ResourceCoverage
from app.schemas.functional_coverage import (
    ApplicationFunctionalCoverage,
    FunctionalCoverageConfidence,
    FunctionalCoverageFinding,
    FunctionalCoverageReport,
)
from app.services import import_graph_engine

# Functional Coverage (Product Certification Engine P1, first slice): static
# detection of real functional WIRING, not just presence -- a button that
# exists but has no handler, a form with no real submit, a screen that never
# calls its API. Same regex/heuristic philosophy as the rest of this codebase
# (import_graph_engine.py's own docstring: "a static, regex-based reader ...
# a regex parser can false-positive") -- every finding carries an explicit
# confidence level instead of a flat pass/fail; only "confirmed_error"
# (multiple independent signals agreeing) is allowed to block certification.

_JS_SUFFIXES = {".tsx", ".jsx", ".ts", ".js"}

# JSX attribute values routinely contain "=>" (arrow functions), which itself
# contains a literal ">" -- a naive `[^>]*` stops at that inner ">" and
# truncates the tag match before ever reaching its real closing bracket. The
# `=>|[^>]` alternation (in that order) consumes an arrow as one atomic unit
# so the repetition only stops at a ">" that's genuinely the tag's own close.
_TAG_ATTRS = r"(?:=>|[^>])*"
_BUTTON_TAG_RE = re.compile(rf"<(button|Button|TouchableOpacity|Pressable)\b({_TAG_ATTRS})>", re.IGNORECASE)
_ONCLICK_ATTR_RE = re.compile(r"(?:onClick|onPress)\s*=\s*\{((?:=>|[^}])*)\}")
_EMPTY_HANDLER_RE = re.compile(r"^\(\)\s*=>\s*\{?\s*\}?$")
_CONSOLE_LOG_HANDLER_RE = re.compile(r"^\(\)\s*=>\s*\{?\s*console\.log\(")
_SUBMIT_TYPE_RE = re.compile(r"type\s*=\s*[\"']submit[\"']", re.IGNORECASE)

_FORM_TAG_RE = re.compile(rf"<form\b({_TAG_ATTRS})>", re.IGNORECASE)
_ONSUBMIT_ATTR_RE = re.compile(r"onSubmit\s*=", re.IGNORECASE)
_HANDLE_SUBMIT_RE = re.compile(r"handleSubmit|onSubmit\s*[:=]", re.IGNORECASE)

_PLACEHOLDER_PHRASE_RE = re.compile(
    r"coming soon|em breve|\btodo\b|placeholder|not implemented|n[aã]o implementado", re.IGNORECASE,
)
_JSX_RETURN_RE = re.compile(r"return\s*\(([\s\S]*?)\)\s*;?\s*\}", re.MULTILINE)

_DATA_SIGNAL_RE = re.compile(r"useState\(|useEffect\(|useQuery\(|useMutation\(|props\.|fetch\(|apiClient\.", re.IGNORECASE)

# Same three regexes _ui_depth_score() already uses (functional_completeness_engine.py) --
# reused verbatim rather than re-derived, just applied per-file here instead of one joined blob.
_API_CALL_RE = re.compile(r"\bfetch\(|axios\.|apiClient\.|useQuery\(|useMutation\(")
_LOADING_RE = re.compile(r"isLoading|loading\s*:|<Spinner|<Skeleton", re.IGNORECASE)
_ERROR_RE = re.compile(r"isError|error\s*:|<ErrorMessage|catch\s*\(", re.IGNORECASE)
_EMPTY_STATE_RE = re.compile(r"empty.?state|no.{0,15}(found|results)|nenhum", re.IGNORECASE)

_NAV_TARGET_RE = re.compile(
    r"router\.push\(\s*['\"]([^'\"]+)|navigation\.navigate\(\s*['\"]([^'\"]+)|<Link\s+href=['\"]([^'\"]+)",
    re.IGNORECASE,
)

_WEIGHTS: dict[FunctionalCoverageConfidence, int] = {
    "confirmed_error": 20, "high_confidence": 8, "warning": 3, "informational": 0,
}


class FunctionalCoverageEngine:
    def evaluate(self, project_id: str, root: Path, resources: list[ResourceCoverage]) -> FunctionalCoverageReport:
        frontend_root = self._find_frontend_root(root)
        mobile_root = self._find_mobile_root(root)

        all_files = {
            p.relative_to(root).as_posix(): self._safe_read(p)
            for p in root.rglob("*")
            if p.is_file() and p.suffix in _JS_SUFFIXES and "node_modules" not in p.parts
        }
        # Reuse the existing Import Graph Engine wholesale for "referenced but
        # nonexistent" (its unresolved_internal edges are exactly this check) --
        # manifests={} because only internal resolution is in scope here, not
        # the external-package/cross-stack checks that engine also does.
        import_graph = import_graph_engine.build_import_graph(all_files, {})
        unresolved = [e for e in import_graph["edges"] if e["status"] == "unresolved_internal"]

        frontend = (
            self._evaluate_application(root, frontend_root, resources, application="frontend", unresolved=unresolved)
            if frontend_root is not None else None
        )
        mobile = (
            self._evaluate_application(root, mobile_root, resources, application="mobile", unresolved=unresolved)
            if mobile_root is not None else None
        )
        return FunctionalCoverageReport(
            project_id=project_id, frontend=frontend, mobile=mobile,
            generated_at=datetime.now(UTC).replace(microsecond=0).isoformat(),
        )

    # ------------------------------------------------------------- discovery

    def _find_frontend_root(self, root: Path) -> Path | None:
        for candidate in (root / "apps" / "web", root / "apps" / "frontend"):
            if candidate.is_dir() and (candidate / "package.json").is_file():
                return candidate
        if (root / "package.json").is_file():
            return root
        return None

    def _find_mobile_root(self, root: Path) -> Path | None:
        for candidate in (root / "apps" / "mobile", root / "mobile"):
            if candidate.is_dir():
                return candidate
        return None

    def _is_page_or_screen(self, path: Path) -> bool:
        name = path.name.lower()
        if name in {"page.tsx", "page.jsx"}:
            return True
        if "screen" in name:
            return True
        return any(part.lower() in {"pages", "screens"} for part in path.parts)

    # --------------------------------------------------------------- per-app

    def _evaluate_application(
        self, root: Path, app_root_path: Path, resources: list[ResourceCoverage], *,
        application: str, unresolved: list[dict],
    ) -> ApplicationFunctionalCoverage:
        findings: list[FunctionalCoverageFinding] = []
        page_files = [
            p for p in app_root_path.rglob("*")
            if p.is_file() and p.suffix in _JS_SUFFIXES and "node_modules" not in p.parts
        ]
        for path in page_files:
            content = self._safe_read(path)
            rel = path.relative_to(root).as_posix()
            findings.extend(self._check_buttons(rel, content))
            findings.extend(self._check_forms(rel, content))
            findings.extend(self._check_placeholder(rel, content, path))
            findings.extend(self._check_component_data(rel, content, path))
            findings.extend(self._check_state_coverage(rel, content))
            if application == "frontend":
                # React Navigation's navigate("ScreenName") targets a registered
                # screen NAME, not a file path -- not resolvable the same
                # file-based way as Next.js app-router paths, so this check is
                # deliberately frontend-only rather than a guessed mobile version.
                findings.extend(self._check_navigation(rel, content, root))

        findings.extend(self._check_resource_wiring(resources, application))

        app_prefix = app_root_path.relative_to(root).as_posix()
        if app_prefix == ".":
            app_prefix = ""  # app_root_path IS root (flat project) -- Path(".").as_posix() == "."
        findings.extend(self._check_unresolved_references(unresolved, app_prefix))

        penalty = sum(_WEIGHTS[f.confidence] for f in findings)
        return ApplicationFunctionalCoverage(
            application=application, score=max(0, 100 - penalty), findings=findings,
            blocking=any(f.confidence == "confirmed_error" for f in findings),
        )

    # ------------------------------------------------------------ detectors

    def _check_buttons(self, rel_path: str, content: str) -> list[FunctionalCoverageFinding]:
        findings: list[FunctionalCoverageFinding] = []
        for match in _BUTTON_TAG_RE.finditer(content):
            tag_attrs = match.group(2)
            handler_match = _ONCLICK_ATTR_RE.search(tag_attrs)
            if handler_match is None:
                if _SUBMIT_TYPE_RE.search(tag_attrs):
                    continue  # a submit button relies on the wrapping <form>, not its own handler
                findings.append(FunctionalCoverageFinding(
                    id=f"button_no_handler:{rel_path}:{match.start()}",
                    category="button_no_handler", confidence="warning", file=rel_path,
                    detail="Button/Pressable has no onClick/onPress handler and is not a submit button.",
                    evidence=["no onClick/onPress attribute", "not type=submit"],
                ))
                continue
            handler_body = handler_match.group(1).strip()
            if _EMPTY_HANDLER_RE.match(handler_body):
                findings.append(FunctionalCoverageFinding(
                    id=f"empty_handler:{rel_path}:{match.start()}",
                    category="empty_handler", confidence="confirmed_error", file=rel_path,
                    detail="Button handler is an empty no-op arrow function.",
                    evidence=["onClick/onPress present", "handler body is empty"],
                ))
            elif _CONSOLE_LOG_HANDLER_RE.match(handler_body):
                findings.append(FunctionalCoverageFinding(
                    id=f"console_log_only_handler:{rel_path}:{match.start()}",
                    category="empty_handler", confidence="confirmed_error", file=rel_path,
                    detail="Button handler only calls console.log -- no real action.",
                    evidence=["onClick/onPress present", "handler body is console.log-only"],
                ))
        return findings

    def _check_forms(self, rel_path: str, content: str) -> list[FunctionalCoverageFinding]:
        findings: list[FunctionalCoverageFinding] = []
        for match in _FORM_TAG_RE.finditer(content):
            tag_attrs = match.group(1)
            has_onsubmit_attr = bool(_ONSUBMIT_ATTR_RE.search(tag_attrs))
            has_handle_submit_elsewhere = bool(_HANDLE_SUBMIT_RE.search(content))
            if has_onsubmit_attr or has_handle_submit_elsewhere:
                continue
            has_submit_button = bool(_SUBMIT_TYPE_RE.search(content))
            confidence: FunctionalCoverageConfidence = "warning" if has_submit_button else "high_confidence"
            findings.append(FunctionalCoverageFinding(
                id=f"form_no_submit:{rel_path}:{match.start()}",
                category="form_no_submit", confidence=confidence, file=rel_path,
                detail="Form has no real submit handler" + ("." if has_submit_button else " and no submit button either."),
                evidence=[
                    "no onSubmit attribute", "no handleSubmit/onSubmit identifier in file",
                    *(["no submit button"] if not has_submit_button else []),
                ],
            ))
        return findings

    def _check_placeholder(self, rel_path: str, content: str, path: Path) -> list[FunctionalCoverageFinding]:
        if not self._is_page_or_screen(path):
            return []
        body_match = _JSX_RETURN_RE.search(content)
        body = body_match.group(1) if body_match else content
        stripped_len = len(re.sub(r"\s+", " ", body).strip())
        phrase_match = _PLACEHOLDER_PHRASE_RE.search(content)
        if stripped_len >= 300:
            return []
        confidence: FunctionalCoverageConfidence = "confirmed_error" if phrase_match else "warning"
        detail = f"Page/screen body is only {stripped_len} chars"
        detail += f" and contains a placeholder phrase ('{phrase_match.group(0)}')." if phrase_match else "."
        return [FunctionalCoverageFinding(
            id=f"placeholder_page:{rel_path}", category="placeholder_page", confidence=confidence, file=rel_path,
            detail=detail,
            evidence=["short JSX body (<300 chars)", *(["placeholder phrase detected"] if phrase_match else [])],
        )]

    def _check_component_data(self, rel_path: str, content: str, path: Path) -> list[FunctionalCoverageFinding]:
        if not self._is_page_or_screen(path) or _DATA_SIGNAL_RE.search(content):
            return []
        return [FunctionalCoverageFinding(
            id=f"component_no_data:{rel_path}", category="component_no_data", confidence="informational", file=rel_path,
            detail=(
                "Page/screen has no visible data signal (no useState/useEffect/useQuery/props/fetch/"
                "apiClient) -- may be a legitimately static page."
            ),
            evidence=["no data-fetching or state hook detected"],
        )]

    def _check_navigation(self, rel_path: str, content: str, root: Path) -> list[FunctionalCoverageFinding]:
        findings: list[FunctionalCoverageFinding] = []
        for match in _NAV_TARGET_RE.finditer(content):
            target = next((g for g in match.groups() if g), None)
            if not target or not target.startswith("/"):
                continue  # relative/external/non-route target, out of scope
            is_dynamic = "[" in target or ":" in target
            if self._route_exists(root, target):
                continue
            findings.append(FunctionalCoverageFinding(
                id=f"broken_navigation:{rel_path}:{target}",
                category="broken_navigation",
                confidence="high_confidence" if is_dynamic else "confirmed_error",
                file=rel_path,
                detail=f"Navigates to '{target}' but no matching page was found.",
                evidence=[
                    "navigation target extracted", "no matching route file resolved",
                    "dynamic segment, best-effort match" if is_dynamic else "static path, unambiguous",
                ],
            ))
        return findings

    def _route_exists(self, root: Path, target: str) -> bool:
        segments = [s for s in target.strip("/").split("/") if s]
        if not segments:
            return True  # "/" always exists
        for app_dir in (root / "apps" / "web" / "app", root / "app"):
            if not app_dir.is_dir():
                continue
            static_dir = app_dir.joinpath(*segments)
            if (static_dir / "page.tsx").is_file() or (static_dir / "page.jsx").is_file():
                return True
            if "[" in segments[-1] or ":" in segments[-1]:
                parent = app_dir.joinpath(*segments[:-1])
                if parent.is_dir() and any(d.is_dir() and d.name.startswith("[") for d in parent.iterdir()):
                    return True
        return False

    def _check_state_coverage(self, rel_path: str, content: str) -> list[FunctionalCoverageFinding]:
        if not _API_CALL_RE.search(content):
            return []
        missing = [
            name for name, present in (
                ("loading", bool(_LOADING_RE.search(content))),
                ("error", bool(_ERROR_RE.search(content))),
                ("empty", bool(_EMPTY_STATE_RE.search(content))),
            ) if not present
        ]
        if not missing:
            return []
        confidence: FunctionalCoverageConfidence = "high_confidence" if len(missing) == 3 else "warning"
        return [FunctionalCoverageFinding(
            id=f"missing_state_coverage:{rel_path}", category="missing_state_coverage", confidence=confidence,
            file=rel_path, detail=f"Makes an API call but is missing {', '.join(missing)} state handling.",
            evidence=["api call detected", *(f"no {name} state signal" for name in missing)],
        )]

    def _check_resource_wiring(self, resources: list[ResourceCoverage], application: str) -> list[FunctionalCoverageFinding]:
        findings: list[FunctionalCoverageFinding] = []
        for resource in resources:
            coverage = resource.frontend if application == "frontend" else resource.mobile
            if coverage is None:
                continue
            if not coverage.apiClient:
                findings.append(FunctionalCoverageFinding(
                    id=f"screen_no_api_call:{application}:{resource.resource}",
                    category="screen_no_api_call", confidence="confirmed_error", file=None,
                    detail=f"'{resource.resource}' has {application} pages/screens but none call its API client.",
                    evidence=[
                        "backend resource exists",
                        f"{application}.apiClient is False (already verified by the Functional Completeness Gate)",
                    ],
                ))
            if not resource.backend.endpoints:
                continue  # nothing to check screen-per-endpoint against
            if application == "frontend":
                slots = (
                    ("list", coverage.listPage), ("create", coverage.createPage),
                    ("edit", coverage.editPage), ("detail", coverage.detailPage), ("delete", coverage.deletePage),
                )
            else:
                slots = (("list", coverage.listScreen), ("detail", coverage.detailScreen), ("delete", coverage.deleteScreen))
            missing_pages = [name for name, present in slots if not present]
            if not missing_pages:
                continue
            category = "endpoint_no_screen" if len(missing_pages) == len(slots) else "incomplete_crud"
            confidence: FunctionalCoverageConfidence = "confirmed_error" if len(missing_pages) >= 2 else "high_confidence"
            findings.append(FunctionalCoverageFinding(
                id=f"{category}:{application}:{resource.resource}", category=category, confidence=confidence, file=None,
                detail=f"'{resource.resource}' backend exposes endpoints but {application} is missing: {', '.join(missing_pages)}.",
                evidence=[f"backend.endpoints={resource.backend.endpoints}", f"missing {application} pages/screens: {missing_pages}"],
            ))
        return findings

    def _check_unresolved_references(self, unresolved: list[dict], app_prefix: str) -> list[FunctionalCoverageFinding]:
        findings: list[FunctionalCoverageFinding] = []
        for edge in unresolved:
            if app_prefix and not edge["source_file"].startswith(app_prefix):
                continue
            findings.append(FunctionalCoverageFinding(
                id=f"unresolved_reference:{edge['source_file']}:{edge['specifier']}",
                category="unresolved_reference", confidence="high_confidence", file=edge["source_file"],
                detail=edge["detail"] or f"'{edge['specifier']}' does not resolve to any real file.",
                evidence=["import/require specifier extracted", "no matching file in the generated project"],
            ))
        return findings

    @staticmethod
    def _safe_read(path: Path) -> str:
        try:
            return path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return ""


functional_coverage_engine = FunctionalCoverageEngine()
