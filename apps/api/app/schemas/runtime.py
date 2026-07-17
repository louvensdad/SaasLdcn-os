from __future__ import annotations

from app.schemas.common import ApiModel


class CpuMetric(ApiModel):
    percent: float
    cores: int | None = None


class MemoryMetric(ApiModel):
    percent: float
    used_bytes: int
    total_bytes: int


class WorkerMetric(ApiModel):
    total: int
    active: int
    idle: int


class RuntimeMetrics(ApiModel):
    """Real runtime telemetry: host CPU/memory/disk from psutil (None when the
    host doesn't expose them), process uptime, the actual agent worker-pool
    size, and live generation-job queue depth."""

    cpu: CpuMetric | None = None
    memory: MemoryMetric | None = None
    disk: MemoryMetric | None = None
    uptime_seconds: int
    workers: WorkerMetric
    jobs_queued: int
    jobs_running: int


class PlatformRuntimeConfig(ApiModel):
    """The platform-wide runtime knobs, real and admin-editable (PUT
    /runtime/config): the shared agent worker-pool size, the generation job
    lease before a stalled job is reclaimed, and the audit log retention
    window. One value for the whole platform -- not a per-user preference,
    because the pool/lease/retention are shared resources."""

    workerLimit: int
    executionTimeoutMinutes: int
    logRetentionDays: int


class UpdatePlatformRuntimeConfigRequest(ApiModel):
    workerLimit: int | None = None
    executionTimeoutMinutes: int | None = None
    logRetentionDays: int | None = None

class TelemetryComponent(ApiModel):
    name: str
    status: str
    timestamp: str
    latency_ms: float | None = None
    activeJobs: int | None = None
    queuedJobs: int | None = None
    activeWorkers: int | None = None
    idleWorkers: int | None = None
    failedJobs: int | None = None
    sandboxStatus: str | None = None
    storageStatus: str | None = None
    detail: str | None = None


class RuntimeTelemetry(ApiModel):
    contractVersion: str
    collectedAt: str
    components: list[TelemetryComponent]