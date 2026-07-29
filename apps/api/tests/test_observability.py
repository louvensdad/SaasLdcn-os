from __future__ import annotations

import json


def test_distinct_requests_get_distinct_request_ids(client):
    first = client.get("/api/health")
    second = client.get("/api/health")

    assert first.headers["X-Request-Id"] and second.headers["X-Request-Id"]
    assert first.headers["X-Request-Id"] != second.headers["X-Request-Id"]


def test_client_supplied_request_id_is_forwarded(client):
    response = client.get("/api/health", headers={"X-Request-Id": "caller-supplied-id"})
    assert response.headers["X-Request-Id"] == "caller-supplied-id"


def test_log_lines_within_one_request_share_the_request_id(client):
    import logging

    from app.core.logging import JsonLogFormatter, request_id_var

    # A handler that formats synchronously at emit() time, the same way the
    # real StreamHandler does -- this is what makes the request id (read from
    # the contextvar at format time) correct: formatting happens while the
    # request is still in flight, not deferred until after it completes.
    captured: list[str] = []

    class _CollectingHandler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            captured.append(self.format(record))

    handler = _CollectingHandler()
    handler.setFormatter(JsonLogFormatter())
    root_logger = logging.getLogger()
    root_logger.addHandler(handler)
    try:
        response = client.get("/api/health")
    finally:
        root_logger.removeHandler(handler)

    request_id = response.headers["X-Request-Id"]
    # The contextvar is reset after the request completes -- outside a request
    # it must never leak the last request's id.
    assert request_id_var.get() == "-"

    entries = [json.loads(line) for line in captured if "GET /api/health" in line]
    assert entries
    assert all(entry["request_id"] == request_id for entry in entries)


def test_metrics_endpoint_reports_request_count(client):
    client.get("/api/health")
    response = client.get("/api/metrics")

    assert response.status_code == 200
    assert "text/plain" in response.headers["content-type"]
    assert "http_requests_total" in response.text
    assert 'path_template="/api/health"' in response.text


def test_health_reports_database_check(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["checks"]["database"] == "ok"
