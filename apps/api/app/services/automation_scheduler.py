from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from croniter import croniter

from app.core.logging import logger
from app.engines.automation_engine import run_automation
from app.repositories.automation_repository import AutomationRepository

# Real in-process background poller (confirmed with the user 2026-07-20, in
# lieu of adopting a new scheduler framework for one trigger type): checks
# every ~30s for scheduled Automations whose next_run_at has passed and fires
# them for real via automation_engine.run_automation(). Documented limitation:
# single-process only -- running multiple API instances would each poll
# independently and could double-fire a due automation. Acceptable for a v1;
# a real distributed lock (e.g. the per-project lock pattern already used in
# change_request_service.py) would be the fix if/when this needs to scale
# beyond one instance.

_POLL_INTERVAL_S = 30.0
_TICK_S = 0.2  # stop() must return fast even during hundreds of test app start/stops


def compute_next_run_at(cron_expr: str, timezone_name: str, *, base: datetime | None = None) -> str:
    tz = ZoneInfo(timezone_name or "UTC")
    anchor = (base or datetime.now(timezone.utc)).astimezone(tz)
    next_dt = croniter(cron_expr, anchor).get_next(datetime)
    return next_dt.astimezone(timezone.utc).replace(microsecond=0).isoformat()


class AutomationScheduler:
    def __init__(self, repository: AutomationRepository | None = None) -> None:
        self.repository = repository or AutomationRepository()
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._lock = threading.Lock()

    def start(self) -> None:
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return
            self._stop_event.clear()
            self._thread = threading.Thread(target=self._run_loop, name="ldcn-automation-scheduler", daemon=True)
            self._thread.start()

    def stop(self, *, timeout: float = 2.0) -> None:
        self._stop_event.set()
        thread = self._thread
        if thread is not None:
            thread.join(timeout=timeout)

    def _run_loop(self) -> None:
        elapsed = _POLL_INTERVAL_S  # poll immediately on the first iteration, not after a full interval
        while not self._stop_event.is_set():
            if elapsed >= _POLL_INTERVAL_S:
                elapsed = 0.0
                try:
                    self._poll_once()
                except Exception as exc:  # noqa: BLE001 -- the scheduler loop must never die
                    logger.warning("automation scheduler poll failed (ignored): %s", exc)
            self._stop_event.wait(timeout=_TICK_S)
            elapsed += _TICK_S

    def _poll_once(self) -> None:
        now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        for automation in self.repository.list_due(before=now):
            try:
                run_automation(automation, trigger_source="scheduled", repository=self.repository)
            except Exception as exc:  # noqa: BLE001 -- one automation's failure must not block the others
                logger.warning("scheduled automation %s failed to run (ignored): %s", automation["id"], exc)
            finally:
                self._reschedule(automation)

    def _reschedule(self, automation: dict[str, Any]) -> None:
        cron_expr = (automation.get("trigger_config") or {}).get("cron")
        if not cron_expr:
            return
        tz_name = (automation.get("trigger_config") or {}).get("timezone") or "UTC"
        try:
            next_run_at = compute_next_run_at(cron_expr, tz_name)
        except Exception as exc:  # noqa: BLE001 -- a malformed cron expression must not crash the poller
            logger.warning("could not compute next run for automation %s (ignored): %s", automation["id"], exc)
            return
        self.repository.set_next_run_at(automation["id"], next_run_at)


automation_scheduler = AutomationScheduler()
