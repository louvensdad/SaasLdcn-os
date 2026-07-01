from __future__ import annotations

import re
from typing import Any

# Shared secret-redaction helpers. Mirrors the rules already proven in
# project_repository.py so chat messages, specs and handoffs persisted by the
# AI Project Room never leak credentials. Kept standalone (no import cycle).

SENSITIVE_KEY_PATTERN = re.compile(
    r"(secret|token|password|api[_-]?key|private[_-]?key|credential)", re.IGNORECASE
)
SENSITIVE_VALUE_PATTERN = re.compile(
    r"(secret|token|password|api[_-]?key|private[_-]?key)\s*[:=]\s*\S+", re.IGNORECASE
)
REDACTED = "[REDACTED]"


def redact_text(value: str) -> str:
    """Mask inline 'api_key=...'/'token: ...' style secrets inside free text."""
    return SENSITIVE_VALUE_PATTERN.sub(REDACTED, value)


def redact_value(value: Any) -> Any:
    """Recursively redact secret-looking keys and inline secrets in any JSON-able value."""
    if isinstance(value, dict):
        redacted: dict[str, Any] = {}
        for key, item in value.items():
            if SENSITIVE_KEY_PATTERN.search(str(key)):
                redacted[key] = REDACTED
            else:
                redacted[key] = redact_value(item)
        return redacted
    if isinstance(value, list):
        return [redact_value(item) for item in value]
    if isinstance(value, str):
        return redact_text(value)
    return value
