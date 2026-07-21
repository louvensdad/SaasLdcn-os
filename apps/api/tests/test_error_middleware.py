from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from app.core.exceptions import UnhandledExceptionMiddleware, configure_exception_handlers


def _build_app() -> FastAPI:
    """Minimal app mirroring main.py's middleware order: UnhandledExceptionMiddleware
    added first (innermost) so CORSMiddleware (added after, hence outer) still gets
    to add its headers to the 500 response it constructs."""
    app = FastAPI()
    app.add_middleware(UnhandledExceptionMiddleware)
    app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"], allow_credentials=True)
    configure_exception_handlers(app)

    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError("something broke deep in a service")

    return app


def test_unhandled_exception_returns_the_safe_json_envelope() -> None:
    with TestClient(_build_app(), raise_server_exceptions=False) as client:
        response = client.get("/boom")
    assert response.status_code == 500
    assert response.json() == {"error": {"code": "internal_server_error", "message": "Internal server error.", "details": []}}


def test_unhandled_exception_still_carries_cors_headers() -> None:
    """Regression test for the Planos e Assinatura 'Failed to fetch' bug (2026-07-21):
    a bare @app.exception_handler(Exception) is handled by Starlette's
    ServerErrorMiddleware, which sits OUTSIDE CORSMiddleware -- so CORS headers were
    silently dropped from every unhandled 500, and browsers reported the fetch as a
    network failure instead of a readable error."""
    with TestClient(_build_app(), raise_server_exceptions=False) as client:
        response = client.get("/boom", headers={"Origin": "http://localhost:3000"})
    assert response.status_code == 500
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
