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

    def __init__(self, message: str, *, transient: bool = False, status_code: int | None = None, code: str = "provider_error") -> None:
        super().__init__(message)
        self.transient = transient
        self.status_code = status_code
        self.code = code


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


def provider_error_details(exc: BaseException) -> tuple[int, str, str]:
    status = getattr(exc, "status_code", None)
    if status is None:
        status = getattr(getattr(exc, "response", None), "status_code", None)
    if status is None:
        status = getattr(exc, "code", None)
    try:
        status = int(status) if status is not None else None
    except (TypeError, ValueError):
        status = None
    name = type(exc).__name__.lower()
    if "timeout" in name:
        return 504, "timeout", "A conexão com o provider excedeu o tempo limite."
    if any(hint in name for hint in ("connection", "network", "remoteprotocol")):
        return 503, "network_error", "Não foi possível conectar ao provider. Verifique a rede e tente novamente."
    messages = {
        401: ("auth_error", "API key inválida ou não autorizada pelo provider."),
        403: ("forbidden", "A API key não possui permissão para acessar este modelo."),
        404: ("not_found", "Modelo ou endpoint não encontrado no provider."),
        429: ("rate_limited", "Limite de requisições atingido. Aguarde e tente novamente."),
        500: ("provider_error", "O provider encontrou um erro interno."),
        502: ("provider_offline", "O provider está temporariamente indisponível."),
        503: ("provider_offline", "O provider está temporariamente indisponível."),
        504: ("timeout", "A conexão com o provider excedeu o tempo limite."),
    }
    code, message = messages.get(status, ("provider_error", "Falha ao comunicar com o provider."))
    return int(status or 502), code, message


def normalize_provider_error(provider: str, model: str, exc: BaseException) -> LLMError:
    """Convert every provider SDK failure to the same safe public contract.

    Raw SDK messages are deliberately not copied: some transports include request
    URLs, headers or credentials in their exception text.
    """
    status_code, code, message = provider_error_details(exc)
    return LLMError(
        f"{provider} ({model}): {message}",
        transient=is_transient_provider_error(exc),
        status_code=status_code,
        code=code,
    )


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
