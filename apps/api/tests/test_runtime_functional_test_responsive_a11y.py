from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

import pytest

from app.schemas.runtime_functional_test import RouteCheck, RuntimeFunctionalTestReport
from app.services.runtime_functional_test_service import RuntimeFunctionalTestService

pytest.importorskip("playwright.sync_api")
from playwright.sync_api import sync_playwright  # noqa: E402

# Real Playwright, real rendered DOM (data: URLs -- no npm install / dev server
# needed, so this validates the actual check logic fast). PARTE 8 items 11
# (responsividade) and 12 (auditoria de acessibilidade).

_CLEAN_HTML = """
<!doctype html><html lang="pt-BR"><head><title>Pedidos</title></head>
<body style="margin:0">
  <img src="x.png" alt="Logo da empresa">
  <label for="email">Email</label>
  <input id="email" type="email">
  <button aria-label="Fechar">X</button>
  <a href="/orders">Ver pedidos</a>
</body></html>
"""

_OVERFLOWING_HTML = """
<!doctype html><html lang="pt-BR"><head><title>Pedidos</title></head>
<body style="margin:0"><div style="width:3000px;height:10px;background:red"></div></body></html>
"""

_INACCESSIBLE_HTML = """
<!doctype html><html><head></head>
<body style="margin:0">
  <img src="x.png">
  <input type="text">
  <button></button>
  <a href="/x"></a>
</body></html>
"""


@pytest.fixture
def service():
    return RuntimeFunctionalTestService()


@pytest.fixture
def evidence_dir():
    root = Path(tempfile.mkdtemp(prefix="ldcn-rft-evidence-"))
    try:
        yield root
    finally:
        shutil.rmtree(root, ignore_errors=True)


@pytest.fixture
def browser():
    with sync_playwright() as pw:
        b = pw.chromium.launch(headless=True)
        try:
            yield b
        finally:
            b.close()


class TestResponsiveCheck:
    def test_clean_page_has_no_overflow_at_any_breakpoint(self, service, browser, evidence_dir):
        page = browser.new_page()
        page.goto(f"data:text/html,{_CLEAN_HTML}")
        results = service._check_responsive(page, "/", evidence_dir)
        page.close()
        assert len(results) == 3
        assert {r.viewport for r in results} == {"mobile", "tablet", "desktop"}
        assert all(not r.horizontal_overflow for r in results)
        assert all(Path(r.screenshot_path).exists() for r in results)

    def test_overflowing_page_is_detected_at_every_breakpoint_narrower_than_it(self, service, browser, evidence_dir):
        # The fixed 3000px-wide element is wider than all three real
        # breakpoints (375/768/1440), so all three must report overflow --
        # with overflow_px shrinking as viewport width grows.
        page = browser.new_page()
        page.goto(f"data:text/html,{_OVERFLOWING_HTML}")
        results = service._check_responsive(page, "/orders", evidence_dir)
        page.close()
        by_viewport = {r.viewport: r for r in results}
        assert all(r.horizontal_overflow for r in results)
        assert by_viewport["mobile"].overflow_px == pytest.approx(3000 - 375, abs=5)
        assert by_viewport["desktop"].overflow_px == pytest.approx(3000 - 1440, abs=5)
        assert by_viewport["mobile"].overflow_px > by_viewport["desktop"].overflow_px

    def test_narrower_overflow_is_only_detected_below_its_own_width(self, service, browser, evidence_dir):
        # An element just past mobile width (375px) but well within tablet/desktop.
        page = browser.new_page()
        page.goto('data:text/html,<!doctype html><html lang="pt-BR"><head><title>t</title></head><body style="margin:0"><div style="width:500px;height:10px"></div></body></html>')
        results = service._check_responsive(page, "/", evidence_dir)
        page.close()
        by_viewport = {r.viewport: r for r in results}
        assert by_viewport["mobile"].horizontal_overflow is True
        assert by_viewport["tablet"].horizontal_overflow is False
        assert by_viewport["desktop"].horizontal_overflow is False

    def test_screenshots_are_named_per_route_and_viewport(self, service, browser, evidence_dir):
        page = browser.new_page()
        page.goto(f"data:text/html,{_CLEAN_HTML}")
        results = service._check_responsive(page, "/orders/detail", evidence_dir)
        page.close()
        names = {Path(r.screenshot_path).name for r in results}
        assert names == {"orders_detail_mobile.png", "orders_detail_tablet.png", "orders_detail_desktop.png"}


class TestAccessibilityCheck:
    def test_clean_page_has_no_findings(self, service, browser):
        page = browser.new_page()
        page.goto(f"data:text/html,{_CLEAN_HTML}")
        findings = service._check_accessibility(page)
        page.close()
        assert findings == []

    def test_inaccessible_page_flags_every_real_issue(self, service, browser):
        page = browser.new_page()
        page.goto(f"data:text/html,{_INACCESSIBLE_HTML}")
        findings = service._check_accessibility(page)
        page.close()
        rules = {f.rule for f in findings}
        assert "img_missing_alt" in rules
        assert "input_missing_label" in rules
        assert "clickable_missing_accessible_name" in rules
        assert "html_missing_lang" in rules
        assert "missing_page_title" in rules

    def test_labeled_input_via_label_for_is_not_flagged(self, service, browser):
        page = browser.new_page()
        page.goto(f"data:text/html,{_CLEAN_HTML}")
        findings = service._check_accessibility(page)
        page.close()
        assert not any(f.rule == "input_missing_label" for f in findings)

    def test_aria_labeled_button_with_no_text_is_not_flagged(self, service, browser):
        page = browser.new_page()
        page.goto('data:text/html,<html lang="en"><head><title>t</title></head><body><button aria-label="Close"></button></body></html>')
        findings = service._check_accessibility(page)
        page.close()
        assert not any(f.rule == "clickable_missing_accessible_name" for f in findings)


class TestBeforeAfterComparison:
    def _report(self, routes: list[RouteCheck]) -> RuntimeFunctionalTestReport:
        return RuntimeFunctionalTestReport(
            project_id="p1", supported=True, backend_started=True, frontend_started=True,
            routes=routes, generated_at="2026-01-01T00:00:00+00:00",
        )

    def test_regression_is_detected(self, service):
        before = self._report([RouteCheck(path="/orders", ok=True)])
        after = self._report([RouteCheck(path="/orders", ok=False, console_errors=["TypeError: x is undefined"])])
        comparison = service.compare(before, after)
        assert comparison.regressed_count == 1
        assert comparison.recovered_count == 0
        assert comparison.routes[0].regressed is True
        assert "TypeError: x is undefined" in comparison.routes[0].new_console_errors

    def test_recovery_is_detected(self, service):
        before = self._report([RouteCheck(path="/orders", ok=False, console_errors=["ReferenceError: y"])])
        after = self._report([RouteCheck(path="/orders", ok=True)])
        comparison = service.compare(before, after)
        assert comparison.recovered_count == 1
        assert comparison.regressed_count == 0
        assert comparison.routes[0].recovered is True
        assert "ReferenceError: y" in comparison.routes[0].resolved_console_errors

    def test_unchanged_route_is_neither_regressed_nor_recovered(self, service):
        before = self._report([RouteCheck(path="/orders", ok=True)])
        after = self._report([RouteCheck(path="/orders", ok=True)])
        comparison = service.compare(before, after)
        assert comparison.regressed_count == 0
        assert comparison.recovered_count == 0

    def test_route_only_present_in_one_run_is_handled(self, service):
        before = self._report([RouteCheck(path="/orders", ok=True)])
        after = self._report([RouteCheck(path="/orders", ok=True), RouteCheck(path="/new-route", ok=True)])
        comparison = service.compare(before, after)
        assert {c.path for c in comparison.routes} == {"/orders", "/new-route"}
        new_route = next(c for c in comparison.routes if c.path == "/new-route")
        assert new_route.previously_ok is False
        assert new_route.now_ok is True
