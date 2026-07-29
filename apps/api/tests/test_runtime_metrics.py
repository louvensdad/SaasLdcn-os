from __future__ import annotations


def test_runtime_metrics_returns_real_host_and_worker_data(client):
    response = client.get("/api/runtime/metrics")

    assert response.status_code == 200
    payload = response.json()
    # Worker pool is the real configured agent-pool size; active+idle == total.
    workers = payload["workers"]
    assert workers["total"] >= 1
    assert workers["active"] + workers["idle"] == workers["total"]
    assert payload["jobs_queued"] >= 0
    assert payload["jobs_running"] >= 0
    assert payload["uptime_seconds"] >= 0
    # psutil is installed in this environment, so host gauges are present.
    assert payload["cpu"] is not None
    assert 0.0 <= payload["cpu"]["percent"] <= 100.0
    assert payload["memory"]["total_bytes"] > 0


def test_runtime_metrics_requires_auth(client):
    authorization = client.headers.pop("Authorization")
    try:
        response = client.get("/api/runtime/metrics")
    finally:
        client.headers["Authorization"] = authorization
    assert response.status_code == 401
