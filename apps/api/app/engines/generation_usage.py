from __future__ import annotations

from typing import Any


def usage_totals(parsed: Any, response: Any) -> tuple[int, int]:
    """Sum every billable response, including format-retry attempts."""
    usages = [item.get("tokens", {}) for item in getattr(parsed, "attempts", []) if item.get("tokens")]
    if not usages and response is not None and getattr(response, "usage", None):
        usages = [response.usage]

    def token_value(usage: dict[str, Any], *keys: str) -> int:
        for key in keys:
            value = usage.get(key)
            if value is not None:
                try:
                    return max(0, int(value))
                except (TypeError, ValueError):
                    return 0
        return 0

    return (
        sum(token_value(usage, "input", "input_tokens", "prompt_tokens") for usage in usages),
        sum(token_value(usage, "output", "output_tokens", "completion_tokens") for usage in usages),
    )