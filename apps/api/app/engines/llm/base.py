from __future__ import annotations

from abc import ABC, abstractmethod

from app.schemas.llm import LLMRequest, LLMResponse


class LLMError(RuntimeError):
    """Typed error for the LLM layer.

    Errors here are raised, never swallowed into a silent None — the deliberate
    opposite of the _safe_build anti-pattern (diagnosis error #5).
    """


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
