from __future__ import annotations

from abc import ABC, abstractmethod

from app.schemas.llm import LLMRequest, LLMResponse

# Default per-request hard timeout when the caller does not set req.timeout_ms.
# Bounds every provider call so a hung connection can never block a worker thread
# (and the SSE stream) indefinitely (diagnosis H1/H2).
DEFAULT_TIMEOUT_MS = 600_000


class LLMError(RuntimeError):
    """Typed error for the LLM layer.

    Errors here are raised, never swallowed into a silent None — the deliberate
    opposite of the _safe_build anti-pattern (diagnosis error #5).

    ``transient`` marks failures that are worth retrying with backoff (timeouts,
    connection resets, 429/5xx). Permanent failures (bad request, invalid schema,
    auth) default to ``transient=False`` so they fail fast instead of being retried.
    """

    def __init__(self, message: str, *, transient: bool = False) -> None:
        super().__init__(message)
        self.transient = transient


class LLMTimeoutError(LLMError):
    """A provider call exceeded its deadline. Always transient."""

    def __init__(self, message: str) -> None:
        super().__init__(message, transient=True)


# HTTP statuses and SDK exception-name fragments that indicate a retryable,
# provider-health problem (as opposed to a client/contract error).
_TRANSIENT_STATUS = {408, 409, 425, 429, 500, 502, 503, 504}
_TRANSIENT_NAME_HINTS = (
    "timeout",
    "connection",
    "ratelimit",
    "serviceunavailable",
    "internalserver",
    "apiconnection",
    "overloaded",
    "toomanyrequests",
    "remoteprotocol",
)


def is_transient_provider_error(exc: BaseException) -> bool:
    """Best-effort classification of a provider SDK exception as transient.

    Provider SDKs raise their own exception hierarchies, but they consistently
    expose either a ``status_code`` (directly or on ``.response``) or a class name
    that names the failure (APITimeoutError, RateLimitError, APIConnectionError,
    InternalServerError, ...). We inspect both so a single helper works across
    anthropic / openai / google without importing any of them.
    """
    status = getattr(exc, "status_code", None)
    if status is None:
        response = getattr(exc, "response", None)
        status = getattr(response, "status_code", None)
    if isinstance(status, int) and status in _TRANSIENT_STATUS:
        return True
    name = type(exc).__name__.lower()
    return any(hint in name for hint in _TRANSIENT_NAME_HINTS)


def timeout_seconds(req: LLMRequest) -> float:
    """Per-request timeout in seconds (for the OpenAI/Anthropic SDKs, which take
    a float seconds value). Falls back to DEFAULT_TIMEOUT_MS."""
    return (req.timeout_ms or DEFAULT_TIMEOUT_MS) / 1000.0


def timeout_ms(req: LLMRequest) -> int:
    """Per-request timeout in milliseconds (for the google-genai SDK, whose
    http_options.timeout is expressed in ms). Falls back to DEFAULT_TIMEOUT_MS."""
    return int(req.timeout_ms or DEFAULT_TIMEOUT_MS)


class LLMAdapter(ABC):
    """A provider adapter translates a neutral LLMRequest into the exact
    parameters its provider accepts, and normalizes the result to LLMResponse.
    """

    @abstractmethod
    def complete(self, model: str, req: LLMRequest, *, api_key: str | None = None) -> LLMResponse:
        """Run the request. When `api_key` is given (a user-owned key), the adapter
        builds an EPHEMERAL client from it and must not cache it on the instance;
        otherwise it uses the shared, env-configured client."""
        ...
