from __future__ import annotations

from fastapi import Request
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest

# Labeled by the matched route *template* (e.g. "/meta-factory/{project_id}/validate"),
# never the raw interpolated path -- otherwise every distinct project/job id would
# become its own label value and the metric cardinality would grow unbounded.
REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests handled.",
    labelnames=("method", "path_template", "status"),
)
REQUEST_DURATION = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds.",
    labelnames=("method", "path_template"),
)
GENERATION_TOKENS = Counter(
    "generation_tokens_total",
    "Provider tokens consumed by generation jobs.",
    labelnames=("direction",),
)
SANDBOX_EXECUTIONS = Counter(
    "sandbox_executions_total",
    "Sandbox executions completed by status and controlled source.",
    labelnames=("status", "source"),
)


LLM_CACHE_EVENTS = Counter(
    "llm_response_cache_events_total",
    "Process-local LLM response cache events.",
    labelnames=("outcome",),
)
LLM_CACHE_ENTRIES = Gauge(
    "llm_response_cache_entries",
    "Current process-local LLM response cache entry count.",
)
LLM_CACHE_BYTES = Gauge(
    "llm_response_cache_bytes",
    "Current serialized bytes held by the process-local LLM response cache.",
)

def _path_template(request: Request) -> str:
    route = request.scope.get("route")
    path = getattr(route, "path", None)
    return path or "unmatched"


def observe_request(request: Request, status_code: int, duration_seconds: float) -> None:
    path_template = _path_template(request)
    REQUEST_COUNT.labels(method=request.method, path_template=path_template, status=str(status_code)).inc()
    REQUEST_DURATION.labels(method=request.method, path_template=path_template).observe(duration_seconds)


def render_latest() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST
