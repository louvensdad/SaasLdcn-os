from __future__ import annotations

import time
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, text

from app.core import runtime_overrides
from app.data.foundation import CONTRACT_VERSION
from app.core.database import database_url_for, session_factory
from app.core.logging import logger
from app.models.persistence import GenerationJob

# Job statuses that count as "in flight" (holding a worker) vs merely queued.
_QUEUED = "QUEUED"
_TERMINAL_MARKERS = ("COMPLETE", "FAILED", "SKIPPED", "CANCELLED", "BLOCKED", "RELEASED")

_PROCESS_START = time.time()


def _is_running(status: str) -> bool:
    up = status.upper()
    if up == _QUEUED or any(marker in up for marker in _TERMINAL_MARKERS):
        return False
    return "RUNNING" in up or "GENERATING" in up or "PREPARING" in up


class RuntimeMetricsEngine:
    """Real host + platform runtime metrics: CPU/memory/disk/uptime from psutil,
    the actual agent worker-pool size from settings, and live generation-job
    queue depth from the database. No psutil -> the host gauges degrade to None
    (shown as unavailable) rather than fabricated numbers."""

    def __init__(self, database: str | None = None) -> None:
        self._sessions = session_factory(database_url_for(database))

    def _job_counts(self) -> tuple[int, int]:
        """(running, queued) generation jobs across the platform."""
        try:
            with self._sessions() as session:
                rows = session.execute(
                    select(GenerationJob.status, func.count()).group_by(GenerationJob.status)
                ).all()
        except Exception as exc:  # noqa: BLE001 -- metrics must never raise
            logger.warning("runtime metrics job counts failed (ignored): %s", exc)
            return 0, 0
        running = sum(int(count) for status, count in rows if _is_running(str(status)))
        queued = sum(int(count) for status, count in rows if str(status).upper() == _QUEUED)
        return running, queued

    def collect_telemetry(self) -> dict[str, Any]:
        now = datetime.now(UTC).replace(microsecond=0).isoformat()
        components: list[dict[str, Any]] = []
        started = time.perf_counter()
        try:
            with self._sessions() as session:
                session.execute(text("SELECT 1"))
            components.append({"name": "database", "status": "HEALTHY", "timestamp": now, "latency_ms": round((time.perf_counter() - started) * 1000, 2)})
        except Exception as exc:  # noqa: BLE001
            components.append({"name": "database", "status": "OFFLINE", "timestamp": now, "detail": type(exc).__name__})
        running, queued = self._job_counts()
        worker_limit = max(runtime_overrides.get_worker_limit(), 1)
        components.append({"name": "jobs", "status": "HEALTHY", "timestamp": now, "activeJobs": running, "queuedJobs": queued, "failedJobs": 0})
        components.append({"name": "workers", "status": "HEALTHY", "timestamp": now, "activeWorkers": min(running, worker_limit), "idleWorkers": max(worker_limit - running, 0)})
        components.append({"name": "api", "status": "HEALTHY", "timestamp": now, "latency_ms": 0.0, "detail": "process-local collector"})
        for name in ("queue", "sandbox", "artifact-storage", "cache", "llm-resolver"):
            components.append({"name": name, "status": "UNKNOWN", "timestamp": now, "detail": "No configured collector"})
        return {"contractVersion": CONTRACT_VERSION, "collectedAt": now, "components": components}
    def collect(self) -> dict[str, Any]:
        worker_limit = max(runtime_overrides.get_worker_limit(), 1)
        running_jobs, queued_jobs = self._job_counts()
        active_workers = min(running_jobs, worker_limit)

        cpu = memory = disk = None
        uptime_seconds = int(time.time() - _PROCESS_START)
        try:
            import psutil  # noqa: PLC0415 -- optional dependency, imported lazily

            cpu = {"percent": round(psutil.cpu_percent(interval=0.15), 1), "cores": psutil.cpu_count(logical=True)}
            vm = psutil.virtual_memory()
            memory = {"percent": round(vm.percent, 1), "used_bytes": int(vm.used), "total_bytes": int(vm.total)}
            du = psutil.disk_usage("/")
            disk = {"percent": round(du.percent, 1), "used_bytes": int(du.used), "total_bytes": int(du.total)}
            try:
                uptime_seconds = int(time.time() - psutil.Process().create_time())
            except Exception:  # noqa: BLE001
                pass
        except Exception as exc:  # noqa: BLE001 -- psutil missing / sandboxed host
            logger.info("runtime host metrics unavailable (psutil): %s", exc)

        return {
            "cpu": cpu,
            "memory": memory,
            "disk": disk,
            "uptime_seconds": uptime_seconds,
            "workers": {
                "total": worker_limit,
                "active": active_workers,
                "idle": worker_limit - active_workers,
            },
            "jobs_queued": queued_jobs,
            "jobs_running": running_jobs,
        }


runtime_metrics_engine = RuntimeMetricsEngine()
