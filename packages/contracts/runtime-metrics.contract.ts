export interface RuntimeCpuMetric {
  readonly percent: number;
  readonly cores: number | null;
}

export interface RuntimeMemoryMetric {
  readonly percent: number;
  readonly used_bytes: number;
  readonly total_bytes: number;
}

export interface RuntimeWorkerMetric {
  readonly total: number;
  readonly active: number;
  readonly idle: number;
}

/** Real runtime telemetry from GET /api/runtime/metrics: host CPU/memory/disk
 * via psutil (null when the host doesn't expose them), process uptime, the
 * actual agent worker-pool size, and live generation-job queue depth. */
export interface RuntimeMetrics {
  readonly cpu: RuntimeCpuMetric | null;
  readonly memory: RuntimeMemoryMetric | null;
  readonly disk: RuntimeMemoryMetric | null;
  readonly uptime_seconds: number;
  readonly workers: RuntimeWorkerMetric;
  readonly jobs_queued: number;
  readonly jobs_running: number;
}

/** The platform-wide runtime knobs from GET/PUT /api/runtime/config: the
 * shared agent worker-pool size, the generation-job lease before a stalled
 * job is reclaimed, and the audit log retention window. One value for the
 * whole platform (PUT requires the admin role) -- not a per-user preference,
 * because the pool/lease/retention are shared resources. */
export interface PlatformRuntimeConfig {
  readonly workerLimit: number;
  readonly executionTimeoutMinutes: number;
  readonly logRetentionDays: number;
}

export interface UpdatePlatformRuntimeConfigRequest {
  readonly workerLimit?: number;
  readonly executionTimeoutMinutes?: number;
  readonly logRetentionDays?: number;
}
