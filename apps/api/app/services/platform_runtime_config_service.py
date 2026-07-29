from __future__ import annotations

from typing import Any

from app.core import runtime_overrides
from app.engines import agent_executor
from app.repositories.platform_runtime_config_repository import PlatformRuntimeConfigRepository


class PlatformRuntimeConfigService:
    """The one place that changes a platform-wide runtime knob: persists it
    (survives restart) and applies it live in this process (no restart
    needed). See app/core/runtime_overrides.py for the in-memory layer and
    app/engines/agent_executor.py for how the worker pool itself resizes."""

    def __init__(self, repository: PlatformRuntimeConfigRepository | None = None) -> None:
        self.repository = repository or PlatformRuntimeConfigRepository()

    def hydrate_from_db(self) -> None:
        """Called once at process startup (before any route can read the
        overrides) so a previously admin-set value survives a restart."""
        row = self.repository.get()
        if row is None:
            return
        if row.get("agent_worker_limit") is not None:
            agent_executor.resize_pool(row["agent_worker_limit"])
        if row.get("generation_job_lease_seconds") is not None:
            runtime_overrides.set_generation_job_lease_seconds(row["generation_job_lease_seconds"])
        if row.get("audit_log_retention_days") is not None:
            runtime_overrides.set_audit_log_retention_days(row["audit_log_retention_days"])

    def get_effective(self) -> dict[str, Any]:
        return {
            "workerLimit": runtime_overrides.get_worker_limit(),
            "executionTimeoutMinutes": runtime_overrides.get_generation_job_lease_seconds() // 60,
            "logRetentionDays": runtime_overrides.get_audit_log_retention_days(),
        }

    def update_worker_limit(self, value: int) -> dict[str, Any]:
        clamped = agent_executor.resize_pool(value)
        self.repository.set("agent_worker_limit", clamped)
        return self.get_effective()

    def update_execution_timeout_minutes(self, minutes: int) -> dict[str, Any]:
        clamped = runtime_overrides.set_generation_job_lease_seconds(minutes * 60)
        self.repository.set("generation_job_lease_seconds", clamped)
        return self.get_effective()

    def update_log_retention_days(self, days: int) -> dict[str, Any]:
        clamped = runtime_overrides.set_audit_log_retention_days(days)
        self.repository.set("audit_log_retention_days", clamped)
        return self.get_effective()


platform_runtime_config_service = PlatformRuntimeConfigService()
