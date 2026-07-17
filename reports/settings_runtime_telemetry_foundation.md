# Settings Phase 2 — Runtime Telemetry Foundation

Status: contract and real collectors implemented.

- Added `GET /api/runtime/telemetry` with `TelemetryComponent` and `RuntimeTelemetry` contracts.
- Database health/latency and generation job/worker counts are measured from real sources.
- API process collector is explicitly process-local.
- Queue, sandbox, artifact storage, cache and LLM resolver are returned as `UNKNOWN` with `No configured collector` until a real collector exists.
- No CPU/RAM/container/autoscaling/cost/uptime value was added to this contract without a source. Existing `/runtime/metrics` remains separate and uses psutil only when available.
- Continuous SSE is not enabled because no continuous collector exists; the endpoint is designed for authenticated polling.