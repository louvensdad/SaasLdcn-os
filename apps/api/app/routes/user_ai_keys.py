from __future__ import annotations

from fastapi import APIRouter, Query, Response, status

from app.core.deps import CurrentUser
from app.schemas.user_ai_key import (
    KeySessionStatus,
    KeySessionStatusResponse,
    TestKeyRequest,
    TestKeyResponse,
    UpsertKeyRequest,
)
from app.services.user_key_session_service import user_key_session
from app.services.llm_settings_service import llm_settings_service

router = APIRouter(tags=["user-ai-keys"])


def _status(user_id: str) -> KeySessionStatusResponse:
    return KeySessionStatusResponse(
        sessions=[
            KeySessionStatus(provider=provider, masked=masked, expires_in_seconds=expires_in)
            for provider, masked, expires_in in user_key_session.status(user_id)
        ]
    )


@router.get("/user-ai-keys/status", response_model=KeySessionStatusResponse)
def get_user_ai_key_status(user: CurrentUser) -> KeySessionStatusResponse:
    """List the user's active encrypted key sessions, masked. Never the raw key."""
    return _status(user["user_id"])



_PROVIDER_TEST_MODEL = {
    "anthropic": "claude-haiku-4-5",
    "openai": "gpt-4.1",
    "google": "gemini-2.5-flash",
    "openrouter": "deepseek/deepseek-r1:free",
    "deepseek": "deepseek-chat",
    "custom": "custom",
}


@router.post("/user-ai-keys/test", response_model=TestKeyResponse)
def test_user_ai_key(payload: TestKeyRequest, user: CurrentUser) -> TestKeyResponse:
    """Validate a user key without storing it or echoing it back."""
    from app.engines.llm.base import LLMError
    from app.engines.llm.router import LLMRouter
    from app.schemas.llm import LLMRequest

    model = _PROVIDER_TEST_MODEL[payload.provider]
    try:
        response = LLMRouter().route(
            LLMRequest(
                system="Return exactly: ok",
                user="Connectivity test. Return exactly: ok",
                max_output_tokens=8,
                timeout_ms=20_000,
                cache_prefix=False,
            ),
            user_choice=model,
            api_key=payload.api_key,
        )
    except LLMError as exc:
        llm_settings_service.validated(user["user_id"], payload.provider, ok=False)
        return TestKeyResponse(ok=False, provider=payload.provider, model=model, http_status=401, message=str(exc))
    except Exception as exc:  # noqa: BLE001 - provider SDKs differ; surface exact message
        llm_settings_service.validated(user["user_id"], payload.provider, ok=False)
        return TestKeyResponse(ok=False, provider=payload.provider, model=model, http_status=502, message=str(exc))
    llm_settings_service.validated(user["user_id"], payload.provider, ok=True)
    return TestKeyResponse(ok=True, provider=payload.provider, model=response.model, http_status=200, message="Chave validada com sucesso.")

@router.post("/user-ai-keys/session", response_model=KeySessionStatusResponse)
def upsert_user_ai_key(payload: UpsertKeyRequest, user: CurrentUser) -> KeySessionStatusResponse:
    """Store a user-owned LLM key in the encrypted ephemeral vault for this user.

    Redis deployments persist only ciphertext with a TTL; local development keeps ciphertext in RAM. The response
    returns only the masked status of the user's sessions.
    """
    user_key_session.set(user["user_id"], payload.provider, payload.api_key, payload.ttl_seconds)
    llm_settings_service.configured(user["user_id"], payload.provider)
    return _status(user["user_id"])


@router.delete("/user-ai-keys/session", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_ai_key(
    user: CurrentUser,
    provider: str | None = Query(default=None),
) -> Response:
    """Purge one provider's key (or all of the user's keys when provider is omitted)."""
    user_key_session.clear(user["user_id"], provider)
    llm_settings_service.removed(user["user_id"], provider)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

