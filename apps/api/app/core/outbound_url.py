from __future__ import annotations

import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import urlsplit


class UnsafeOutboundUrlError(ValueError):
    """Raised when a user-controlled URL could reach a non-public resource."""


_ALLOWED_SCHEMES = {"http", "https"}
_ALLOWED_PORTS = {80, 443}
_BLOCKED_HOST_SUFFIXES = (".localhost", ".local", ".internal", ".home.arpa")


@dataclass(frozen=True)
class PublicHttpTarget:
    url: str
    hostname: str
    port: int
    addresses: tuple[str, ...]


def _assert_public_ip(raw: str) -> None:
    try:
        address = ipaddress.ip_address(raw)
    except ValueError as exc:
        raise UnsafeOutboundUrlError("The destination resolved to an invalid IP address.") from exc
    if not address.is_global:
        raise UnsafeOutboundUrlError("Private, loopback, link-local and reserved destinations are blocked.")


def resolve_public_http_target(url: str, *, resolve_dns: bool) -> PublicHttpTarget:
    """Validate a URL and return the exact public IPs approved for connection."""
    if not url or len(url) > 2048:
        raise UnsafeOutboundUrlError("A valid destination URL is required.")
    parsed = urlsplit(url)
    if parsed.scheme.lower() not in _ALLOWED_SCHEMES:
        raise UnsafeOutboundUrlError("Only HTTP and HTTPS destinations are allowed.")
    if parsed.username is not None or parsed.password is not None:
        raise UnsafeOutboundUrlError("Credentials embedded in destination URLs are blocked.")
    if "{{credential:" in parsed.netloc:
        raise UnsafeOutboundUrlError("Credential placeholders are not allowed in the destination host.")
    hostname = (parsed.hostname or "").rstrip(".").lower()
    if not hostname:
        raise UnsafeOutboundUrlError("The destination URL must include a hostname.")
    if hostname == "localhost" or hostname.endswith(_BLOCKED_HOST_SUFFIXES):
        raise UnsafeOutboundUrlError("Local and internal hostnames are blocked.")
    try:
        port = parsed.port or (443 if parsed.scheme.lower() == "https" else 80)
    except ValueError as exc:
        raise UnsafeOutboundUrlError("The destination URL contains an invalid port.") from exc
    if port not in _ALLOWED_PORTS:
        raise UnsafeOutboundUrlError("Only destination ports 80 and 443 are allowed.")

    try:
        direct_ip = ipaddress.ip_address(hostname)
    except ValueError:
        direct_ip = None
    addresses: set[str] = set()
    if direct_ip is not None:
        _assert_public_ip(str(direct_ip))
        addresses.add(str(direct_ip))
    elif resolve_dns:
        try:
            addresses = {
                entry[4][0]
                for entry in socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
            }
        except socket.gaierror as exc:
            raise UnsafeOutboundUrlError("The destination hostname could not be resolved.") from exc
        if not addresses:
            raise UnsafeOutboundUrlError("The destination hostname did not resolve to an address.")
        for address in addresses:
            _assert_public_ip(address)
    return PublicHttpTarget(url=url, hostname=hostname, port=port, addresses=tuple(sorted(addresses)))


def validate_public_http_url(url: str, *, resolve_dns: bool) -> str:
    """Compatibility wrapper for validation-only call sites."""
    return resolve_public_http_target(url, resolve_dns=resolve_dns).url
