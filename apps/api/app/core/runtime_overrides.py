from __future__ import annotations

import threading

from app.core.config import get_settings

# In-memory, process-wide overrides for the platform runtime knobs that are
# otherwise fixed for the process lifetime by `Settings` (an `lru_cache`'d
# pydantic model -- it cannot be mutated after first read). An admin changing
# these via PUT /runtime/config writes through PlatformRuntimeConfigRepository
# (durable across restarts) AND calls the setters here (immediate effect in
# this running process). On startup, `platform_runtime_config_service`
# hydrates these from the DB row before anything else reads them.
#
# `None` means "no override" -- callers fall back to the environment-derived
# Settings default, exactly like before this module existed.

_lock = threading.Lock()
_worker_limit: int | None = None
_generation_job_lease_seconds: int | None = None
_audit_log_retention_days: int | None = None

WORKER_LIMIT_MIN, WORKER_LIMIT_MAX = 1, 64
LEASE_SECONDS_MIN, LEASE_SECONDS_MAX = 60, 14_400
LOG_RETENTION_DAYS_MIN, LOG_RETENTION_DAYS_MAX = 1, 3650


def get_worker_limit() -> int:
    with _lock:
        if _worker_limit is not None:
            return _worker_limit
    return max(1, int(get_settings().agent_worker_limit))


def set_worker_limit(value: int) -> int:
    global _worker_limit
    clamped = max(WORKER_LIMIT_MIN, min(WORKER_LIMIT_MAX, int(value)))
    with _lock:
        _worker_limit = clamped
    return clamped


def get_generation_job_lease_seconds() -> int:
    with _lock:
        if _generation_job_lease_seconds is not None:
            return _generation_job_lease_seconds
    return int(get_settings().generation_job_lease_seconds)


def set_generation_job_lease_seconds(value: int) -> int:
    global _generation_job_lease_seconds
    clamped = max(LEASE_SECONDS_MIN, min(LEASE_SECONDS_MAX, int(value)))
    with _lock:
        _generation_job_lease_seconds = clamped
    return clamped


def get_audit_log_retention_days() -> int:
    with _lock:
        if _audit_log_retention_days is not None:
            return _audit_log_retention_days
    return int(get_settings().audit_log_retention_days)


def set_audit_log_retention_days(value: int) -> int:
    global _audit_log_retention_days
    clamped = max(LOG_RETENTION_DAYS_MIN, min(LOG_RETENTION_DAYS_MAX, int(value)))
    with _lock:
        _audit_log_retention_days = clamped
    return clamped


def _reset_for_tests() -> None:
    global _worker_limit, _generation_job_lease_seconds, _audit_log_retention_days
    with _lock:
        _worker_limit = None
        _generation_job_lease_seconds = None
        _audit_log_retention_days = None
