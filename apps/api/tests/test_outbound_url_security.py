from __future__ import annotations

import socket

import pytest

from app.core.outbound_url import PublicHttpTarget, UnsafeOutboundUrlError, validate_public_http_url
from app.engines.automation_engine import _PinnedNetworkBackend


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/admin",
        "http://[::1]/admin",
        "http://10.0.0.1/internal",
        "http://169.254.169.254/latest/meta-data",
        "http://localhost/internal",
        "http://service.internal/private",
        "file:///etc/passwd",
        "https://user:password@example.com",
        "https://example.com:8443/private",
    ],
)
def test_rejects_non_public_or_unsupported_destinations(url):
    with pytest.raises(UnsafeOutboundUrlError):
        validate_public_http_url(url, resolve_dns=False)


def test_rejects_hostname_resolving_to_private_ip(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *args, **kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.8", 443))],
    )
    with pytest.raises(UnsafeOutboundUrlError):
        validate_public_http_url("https://public-looking.example", resolve_dns=True)


def test_accepts_hostname_only_when_all_answers_are_public(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *args, **kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))],
    )
    assert validate_public_http_url("https://example.com/path", resolve_dns=True) == "https://example.com/path"


def test_rejects_hostname_when_any_dns_answer_is_private(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *args, **kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443)),
        ],
    )
    with pytest.raises(UnsafeOutboundUrlError):
        validate_public_http_url("https://mixed-answer.example", resolve_dns=True)


def test_pinned_backend_connects_to_validated_ip_not_hostname():
    target = PublicHttpTarget(
        url="https://example.com/path", hostname="example.com", port=443,
        addresses=("93.184.216.34",),
    )
    backend = _PinnedNetworkBackend(target)
    seen = {}

    class Delegate:
        def connect_tcp(self, host, port, timeout, local_address, socket_options):
            seen.update(host=host, port=port)
            return object()

    backend._delegate = Delegate()
    backend.connect_tcp("example.com", 443)
    assert seen == {"host": "93.184.216.34", "port": 443}
