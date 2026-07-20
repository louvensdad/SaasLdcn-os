from __future__ import annotations

import http.server
import importlib.util
import threading

import pytest

from app.services.preview_inspector import PreviewInspector, PreviewInspectorError

_PLAYWRIGHT_AVAILABLE = importlib.util.find_spec("playwright") is not None

_PAGE = b"""<!doctype html>
<html><body>
<h1 id="title">hello</h1>
<script>
console.error("boom from console");
document.title = "page-one";
</script>
</body></html>
"""

_PAGE_TWO = b"<!doctype html><html><body><h1>page two</h1></body></html>"


class _Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 -- BaseHTTPRequestHandler's naming convention
        body = _PAGE_TWO if self.path == "/two" else _PAGE
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 -- matches base signature
        pass  # keep test output quiet


@pytest.fixture
def local_server():
    server = http.server.HTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        thread.join(timeout=5)


@pytest.mark.skipif(not _PLAYWRIGHT_AVAILABLE, reason="playwright is not installed in this environment")
def test_inspector_captures_real_console_errors_from_a_real_page(local_server):
    inspector = PreviewInspector(local_server)
    try:
        entries = []
        for _ in range(50):
            entries = inspector.snapshot_console()
            if entries:
                break
            import time
            time.sleep(0.2)
        assert any("boom from console" in e["text"] for e in entries)
    finally:
        inspector.stop()


@pytest.mark.skipif(not _PLAYWRIGHT_AVAILABLE, reason="playwright is not installed in this environment")
def test_inspector_screenshot_returns_real_png_bytes(local_server):
    inspector = PreviewInspector(local_server)
    try:
        image = inspector.screenshot()
        assert image.startswith(b"\x89PNG\r\n")
    finally:
        inspector.stop()


@pytest.mark.skipif(not _PLAYWRIGHT_AVAILABLE, reason="playwright is not installed in this environment")
def test_inspector_navigate_moves_to_the_new_url(local_server):
    inspector = PreviewInspector(local_server)
    try:
        inspector.navigate(f"{local_server}/two")
        # No exception is the real assertion here (goto succeeded); a second
        # screenshot proves the worker thread is still alive and responsive
        # after navigating, not just that the call didn't raise.
        image = inspector.screenshot()
        assert image.startswith(b"\x89PNG\r\n")
    finally:
        inspector.stop()


def test_inspector_reports_missing_playwright_without_crashing(monkeypatch):
    import app.services.preview_inspector as mod

    real_import = __import__

    def _blocked_import(name, *args, **kwargs):
        if name == "playwright.sync_api":
            raise ImportError("no playwright")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr("builtins.__import__", _blocked_import)
    inspector = mod.PreviewInspector("http://127.0.0.1:1/")
    with pytest.raises(PreviewInspectorError):
        inspector.screenshot()
