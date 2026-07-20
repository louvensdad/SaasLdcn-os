from __future__ import annotations

import threading
from collections import deque
from datetime import UTC, datetime
from queue import Queue
from typing import Any


def _now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


class PreviewInspectorError(RuntimeError):
    """Raised when a command to the inspector's headless browser fails or times out."""


class PreviewInspector:
    """Real backing for 'Navegador integrado's console/error panel and
    screenshot button (03 - Funcionalidades/Navegador integrado.md,
    23 - UX/Tela Preview.md). The live preview iframe points directly at the
    generated app's own origin (see live_preview_service.py's module
    docstring), so the parent page can never legally read its console output
    or DOM -- cross-origin Same-Origin Policy blocks it, same constraint that
    already ruled out a same-origin proxy earlier in this codebase. Instead
    of pretending otherwise, this runs a SEPARATE real headless Chromium page
    (Playwright, already a dependency via runtime_functional_test_service.py)
    navigated to the same URL, and mirrors its console/pageerror events and
    screenshots -- an honest, real browser, not a simulation.

    Playwright's sync API requires every call on a Browser/Page to happen on
    the thread that created it, so this owns one dedicated worker thread and
    takes commands through a queue rather than being called directly from
    request-handling threads."""

    def __init__(self, start_url: str) -> None:
        self._commands: Queue[tuple[str, dict[str, Any], dict[str, Any], threading.Event] | None] = Queue()
        self.console_log: deque[dict[str, str]] = deque(maxlen=200)
        self._ready = threading.Event()
        self.error: str | None = None
        self._thread = threading.Thread(target=self._run, args=(start_url,), daemon=True)
        self._thread.start()

    def _run(self, start_url: str) -> None:
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            self.error = "playwright não está instalado neste ambiente."
            self._ready.set()
            return
        try:
            with sync_playwright() as pw:
                browser = pw.chromium.launch(headless=True)
                try:
                    page = browser.new_page()
                    page.on(
                        "console",
                        lambda msg: self.console_log.append({"type": msg.type, "text": msg.text, "at": _now()})
                        if msg.type in ("error", "warning") else None,
                    )
                    page.on(
                        "pageerror",
                        lambda exc: self.console_log.append({"type": "pageerror", "text": str(exc), "at": _now()}),
                    )
                    try:
                        page.goto(start_url, wait_until="domcontentloaded", timeout=15_000)
                    except Exception as exc:  # noqa: BLE001 -- a slow/failed first load must not kill the worker
                        self.console_log.append({"type": "pageerror", "text": f"Falha ao abrir {start_url}: {exc}", "at": _now()})
                    self._ready.set()
                    while True:
                        item = self._commands.get()
                        if item is None:
                            break
                        action, kwargs, result, done = item
                        try:
                            if action == "screenshot":
                                result["bytes"] = page.screenshot(full_page=bool(kwargs.get("full_page")))
                            elif action == "goto":
                                page.goto(kwargs["url"], wait_until="domcontentloaded", timeout=15_000)
                            elif action == "reload":
                                page.reload(wait_until="domcontentloaded", timeout=15_000)
                        except Exception as exc:  # noqa: BLE001 -- surface to the caller, never crash the worker loop
                            result["error"] = str(exc)
                        finally:
                            done.set()
                finally:
                    browser.close()
        except Exception as exc:  # noqa: BLE001 -- browser launch itself failed
            self.error = str(exc)
            self._ready.set()

    def _submit(self, action: str, *, timeout: float = 20.0, **kwargs: Any) -> dict[str, Any]:
        if not self._ready.wait(timeout=15.0):
            return {"error": "tempo esgotado aguardando o navegador de inspeção iniciar."}
        if self.error:
            return {"error": self.error}
        result: dict[str, Any] = {}
        done = threading.Event()
        self._commands.put((action, kwargs, result, done))
        if not done.wait(timeout=timeout):
            return {"error": "tempo esgotado aguardando o navegador de inspeção responder."}
        return result

    def screenshot(self) -> bytes:
        result = self._submit("screenshot")
        if "error" in result:
            raise PreviewInspectorError(result["error"])
        return result["bytes"]

    def navigate(self, url: str) -> None:
        result = self._submit("goto", url=url)
        if "error" in result:
            raise PreviewInspectorError(result["error"])

    def reload(self) -> None:
        result = self._submit("reload")
        if "error" in result:
            raise PreviewInspectorError(result["error"])

    def snapshot_console(self) -> list[dict[str, str]]:
        return list(self.console_log)

    def stop(self) -> None:
        self._commands.put(None)
