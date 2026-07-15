from __future__ import annotations

import re
from pathlib import Path


class ArtifactSecurityError(RuntimeError):
    """Raised when generated output contains material that must never persist."""


_ENV_TEMPLATE_NAMES = {".env.example", ".env.sample", ".env.template", ".env.dist"}
_FORBIDDEN_SUFFIXES = {".pem", ".key", ".p12", ".pfx", ".jks"}
_FORBIDDEN_NAMES = {"id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", "credentials.json"}
_HIGH_CONFIDENCE_SECRETS = (
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\bgh[opusr]_[A-Za-z0-9_]{24,}\b"),
    re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b"),
    re.compile(
        r"(?im)^\s*(?:api[_-]?key|secret|token|password|private[_-]?key|credential)\s*[:=]\s*"
        r"['\"]?(?!change-me\b|changeme\b|example\b|placeholder\b|your[_-]|<)[A-Za-z0-9_./+=-]{16,}"
    ),
)



_SECRET_ASSIGNMENT = re.compile(
    r"(?im)^(\s*(?:api[_-]?key|secret|token|password|credential)\s*[:=]\s*)"
    r"(['\"]?)(?!change-me\b|changeme\b|example\b|placeholder\b|your[_-]|<)"
    r"[A-Za-z0-9_./+=-]{16,}(['\"]?)"
)


def sanitize_untrusted_source(content: str) -> str:
    """Replace credential values while preserving source/config assignment syntax."""
    sanitized = _SECRET_ASSIGNMENT.sub(r'\1"change-me"', content)
    sanitized = re.sub(r"AKIA[0-9A-Z]{16}", "AWS_ACCESS_KEY_ID_REDACTED", sanitized)
    sanitized = re.sub(r"\bgh[opusr]_[A-Za-z0-9_]{24,}\b", "GIT_TOKEN_REDACTED", sanitized)
    sanitized = re.sub(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b", "LLM_KEY_REDACTED", sanitized)
    return sanitized

def artifact_block_reason(relative_path: str, content: str | bytes | None = None) -> str:
    normalized = relative_path.replace("\\", "/").strip("/")
    name = Path(normalized).name.lower()
    if name.startswith(".env") and name not in _ENV_TEMPLATE_NAMES:
        return "real environment files are forbidden; generate .env.example only"
    if name in _FORBIDDEN_NAMES or Path(name).suffix.lower() in _FORBIDDEN_SUFFIXES:
        return "private key or credential files are forbidden"
    if content is None:
        return ""
    if isinstance(content, bytes):
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            return ""
    else:
        text = content
    if any(pattern.search(text) for pattern in _HIGH_CONFIDENCE_SECRETS):
        return "high-confidence secret material is forbidden"
    return ""


def assert_artifact_safe(relative_path: str, content: str | bytes | None = None) -> None:
    reason = artifact_block_reason(relative_path, content)
    if reason:
        raise ArtifactSecurityError(f"Artifact '{relative_path}' blocked: {reason}.")
