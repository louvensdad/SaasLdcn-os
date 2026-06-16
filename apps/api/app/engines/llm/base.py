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
    def complete(self, model: str, req: LLMRequest) -> LLMResponse: ...
