from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path

from app.engines.functional_coverage_engine import functional_coverage_engine
from app.schemas.authenticity import AuthenticityConfidence, AuthenticityFinding, AuthenticityReport

# Frontend Authenticity Review Gate (PARTE 7 of the request): static
# detection of content that makes a generated frontend read as an unfinished
# AI template rather than a real product for the stated domain -- literal
# Lorem Ipsum, generic marketing-template filler copy, generic
# placeholder-image services, and mock data leaking into a real page/
# component instead of staying inside the designated mock/repository layer
# FRONTEND_RULES already mandates (HttpRepository/MockRepository + MSW).
#
# This is a static/regex detector, same philosophy and same confidence
# scale as functional_coverage_engine.py: only "confirmed_error" (an
# unambiguous literal match) is allowed to block; everything else is a
# warning surfaced for review, never silently auto-fixed here.
#
# Deliberately does NOT attempt: repetitive-layout detection, visual/
# typography distinctiveness, or "does this look premium" -- those are
# genuinely holistic judgments better made by an LLM reviewer pass (see
# PARTE 7's ten questions), which is a separate, opt-in engine so it doesn't
# silently add an LLM call (cost/latency) to every generation by default.

_JS_SUFFIXES = {".tsx", ".jsx", ".ts", ".js"}

_LOREM_IPSUM_RE = re.compile(r"lorem ipsum", re.IGNORECASE)

# Stripped before the generic-copy scan so a legitimate UX placeholder
# attribute (placeholder="Digite seu email") never counts as filler *body*
# copy -- only literal phrases that survive outside any placeholder="..."/
# placeholder={...} attribute value are flagged.
_PLACEHOLDER_ATTR_RE = re.compile(r'placeholder\s*=\s*(?:"[^"]*"|\'[^\']*\'|\{[^}]*\})')

_GENERIC_COPY_PHRASES = (
    "welcome to our platform", "your company name", "your amazing product",
    "insert your text here", "sample text goes here", "this is a sample",
    "acme corp", "acme inc", "john doe", "jane doe", "company name here",
    "your product name", "add your content here", "your headline here",
    "example company", "sample company", "test company", "foo bar baz",
)
_GENERIC_COPY_RE = re.compile("|".join(re.escape(phrase) for phrase in _GENERIC_COPY_PHRASES), re.IGNORECASE)
_WEAK_GENERIC_COPY_RE = re.compile(r"\bhello world\b", re.IGNORECASE)

_GENERIC_IMAGE_RE = re.compile(
    r"picsum\.photos|via\.placeholder\.com|placehold\.co|loremflickr\.com|dummyimage\.com|"
    r"source\.unsplash\.com/random|fakeimg\.pl",
    re.IGNORECASE,
)

_MOCK_DATA_IDENTIFIER_RE = re.compile(
    r"\b(?:const|let|var)\s+(mockData|fakeUsers|dummyData|sampleData|MOCK_DATA|FAKE_DATA|mockUsers|fakeData)\b",
)
# A file under any of these path segments is the legitimate mock/repository
# layer FRONTEND_RULES already mandates -- expected to contain mock arrays.
_MOCK_LAYER_PATH_MARKERS = ("mock", "msw", "__mocks__")

_WEIGHTS: dict[AuthenticityConfidence, int] = {
    "confirmed_error": 20, "high_confidence": 8, "warning": 3, "informational": 0,
}


class FrontendAuthenticityGate:
    def evaluate(self, project_id: str, root: Path) -> AuthenticityReport:
        frontend_root = functional_coverage_engine._find_frontend_root(root)  # noqa: SLF001 -- shared static helper, same convention live_preview_service.py already uses
        findings: list[AuthenticityFinding] = []
        if frontend_root is not None:
            page_files = [
                p for p in frontend_root.rglob("*")
                if p.is_file() and p.suffix in _JS_SUFFIXES and "node_modules" not in p.parts
            ]
            for path in page_files:
                content = self._safe_read(path)
                if not content:
                    continue
                rel = path.relative_to(root).as_posix()
                findings.extend(self._check_lorem_ipsum(rel, content))
                findings.extend(self._check_generic_copy(rel, content))
                findings.extend(self._check_generic_images(rel, content))
                findings.extend(self._check_mock_data(rel, content))

        penalty = sum(_WEIGHTS[finding.confidence] for finding in findings)
        return AuthenticityReport(
            project_id=project_id,
            score=max(0, 100 - penalty),
            findings=findings,
            blocking=any(finding.confidence == "confirmed_error" for finding in findings),
            generated_at=datetime.now(UTC).replace(microsecond=0).isoformat(),
        )

    def _check_lorem_ipsum(self, rel_path: str, content: str) -> list[AuthenticityFinding]:
        match = _LOREM_IPSUM_RE.search(content)
        if not match:
            return []
        return [AuthenticityFinding(
            id=f"lorem_ipsum:{rel_path}:{match.start()}", category="lorem_ipsum", confidence="confirmed_error",
            file=rel_path, detail="Contains literal 'Lorem ipsum' placeholder text.",
            evidence=["'lorem ipsum' found in generated content"],
        )]

    def _check_generic_copy(self, rel_path: str, content: str) -> list[AuthenticityFinding]:
        findings: list[AuthenticityFinding] = []
        stripped = _PLACEHOLDER_ATTR_RE.sub("", content)
        match = _GENERIC_COPY_RE.search(stripped)
        if match:
            findings.append(AuthenticityFinding(
                id=f"generic_copy:{rel_path}:{match.start()}", category="generic_copy", confidence="confirmed_error",
                file=rel_path, detail=f"Contains generic template copy ('{match.group(0)}').",
                evidence=["known generic/template marketing phrase matched outside any placeholder attribute"],
            ))
        weak_match = _WEAK_GENERIC_COPY_RE.search(stripped)
        if weak_match:
            findings.append(AuthenticityFinding(
                id=f"weak_generic_copy:{rel_path}:{weak_match.start()}", category="generic_copy", confidence="warning",
                file=rel_path, detail="Contains 'Hello World' -- may be leftover scaffolding text.",
                evidence=["'hello world' found in rendered content"],
            ))
        return findings

    def _check_generic_images(self, rel_path: str, content: str) -> list[AuthenticityFinding]:
        match = _GENERIC_IMAGE_RE.search(content)
        if not match:
            return []
        return [AuthenticityFinding(
            id=f"generic_placeholder_image:{rel_path}:{match.start()}", category="generic_placeholder_image",
            confidence="high_confidence", file=rel_path,
            detail=f"References a generic placeholder-image service ('{match.group(0)}') instead of real/generated imagery.",
            evidence=["known placeholder-image domain matched"],
        )]

    def _check_mock_data(self, rel_path: str, content: str) -> list[AuthenticityFinding]:
        if any(marker in rel_path.lower() for marker in _MOCK_LAYER_PATH_MARKERS):
            return []
        match = _MOCK_DATA_IDENTIFIER_RE.search(content)
        if not match:
            return []
        return [AuthenticityFinding(
            id=f"mock_data_outside_mock_layer:{rel_path}:{match.start()}", category="mock_data_outside_mock_layer",
            confidence="high_confidence", file=rel_path,
            detail=f"Defines '{match.group(1)}' directly in a page/component file instead of the mock/repository layer.",
            evidence=["mock-shaped identifier found outside any mock/msw/__mocks__ path"],
        )]

    @staticmethod
    def _safe_read(path: Path) -> str:
        try:
            return path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return ""


frontend_authenticity_gate = FrontendAuthenticityGate()
