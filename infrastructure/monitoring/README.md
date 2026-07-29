# Production Monitoring

## Metrics access

Prometheus scrapes `GET /api/metrics` with `Authorization: Bearer <LDCN_METRICS_BEARER_TOKEN>`. Production startup rejects tokens shorter than 32 characters. The endpoint must be reachable only from the monitoring network and must never be published through the public ingress.

Available metrics include HTTP request count/latency by route template, generation input/output tokens, process metrics, and sandbox completions by controlled source/status. Labels never contain tenant, project, job, command, path, provider error, or secret data.

`X-Request-Id` is accepted or generated at the API boundary, returned to the caller, and attached to structured request logs. Job evidence carries job/project/workspace/sandbox identifiers for correlation without placing them in Prometheus labels.

## Initial SLOs

| Signal | Objective | Alert |
| --- | --- | --- |
| API availability | 99.9% successful non-5xx requests over 30 days | 5xx ratio > 2% for 10 minutes |
| API latency | 95% of non-stream requests below 1 second | p95 > 2 seconds for 15 minutes |
| Generation terminality | 99% of started jobs reach a terminal or recoverable state within their configured timeout | expired lease or RUNNING beyond lease + 5 minutes |
| Sandbox cleanup | 100% of executions terminate and persist evidence | SANDBOX_ERROR spike or container survives job cleanup |
| Token budget | 100% of provider calls reserve budget before dispatch | budget rejection rate or daily use > 80% |

## Runbooks

### Stalled generation job

1. Locate the job and its latest `X-Request-Id`/worker logs.
2. Check `lease_owner`, `lease_expires_at`, `heartbeat_at`, attempt count, and current stage.
3. Confirm the worker is healthy; never mutate a live lease.
4. After lease expiry, allow startup reconciliation to mark `STALLED`, then resume through the supported job API.
5. Escalate repeated stalls with sanitized provider diagnostics and token totals.

### Sandbox failure or resource limit

1. Read the persisted execution evidence and status; do not rerun the command on the host.
2. For `RESOURCE_LIMIT_EXCEEDED`, inspect the recorded limit/resource fields and changed-file list.
3. For `SANDBOX_ERROR`, verify Docker worker health, runtime image availability, proxy network, and cleanup.
4. Quarantine artifacts when status is `SECURITY_BLOCKED`; never weaken policy for a single job.

### Redis, PostgreSQL, or S3 degradation

1. Stop new production work if the required shared dependency is unavailable.
2. Verify credentials through the secret manager without printing them.
3. Restore PostgreSQL/S3 from the most recent verified backup when integrity is affected.
4. Reconcile expired leases after service restoration and validate artifact checksums before resuming.

### Abnormal token use

1. Compare input/output counters with per-job and per-owner persisted totals.
2. Pause affected jobs through the API when consumption is unexpected.
3. Revoke temporary user-key sessions if compromise is suspected.
4. Preserve only redacted diagnostics and request/job identifiers for investigation.