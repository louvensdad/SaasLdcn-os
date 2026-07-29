from __future__ import annotations

import pytest

from app.engines.llm.base import normalize_provider_error


class ProviderFailure(Exception):
    def __init__(self, status_code: int, secret: str = "raw-provider-secret") -> None:
        super().__init__(secret)
        self.status_code = status_code


@pytest.mark.parametrize(
    ("status", "code", "transient"),
    [
        (401, "auth_error", False),
        (403, "forbidden", False),
        (404, "not_found", False),
        (429, "rate_limited", True),
        (500, "provider_error", True),
        (502, "provider_offline", True),
        (503, "provider_offline", True),
        (504, "timeout", True),
    ],
)
def test_provider_http_errors_share_one_safe_contract(status, code, transient):
    error = normalize_provider_error("Provider", "model-v1", ProviderFailure(status))
    assert error.status_code == status
    assert error.code == code
    assert error.transient is transient
    assert "raw-provider-secret" not in str(error)
    assert "Provider (model-v1)" in str(error)


def test_network_error_is_friendly_and_transient():
    NetworkFailure = type("APIConnectionError", (Exception,), {})
    error = normalize_provider_error("Provider", "model-v1", NetworkFailure("socket details"))
    assert error.status_code == 503
    assert error.code == "network_error"
    assert error.transient is True
    assert "socket details" not in str(error)


def test_timeout_is_friendly_and_transient():
    TimeoutFailure = type("APITimeoutError", (Exception,), {})
    error = normalize_provider_error("Provider", "model-v1", TimeoutFailure("request dump"))
    assert error.status_code == 504
    assert error.code == "timeout"
    assert error.transient is True
    assert "request dump" not in str(error)
