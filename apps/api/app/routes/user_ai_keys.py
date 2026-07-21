from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Response, status

from app.core.deps import CurrentUser
from app.repositories.redaction import REDACTED, redact_text
from app.schemas.user_ai_key import (
    AiKeyListResponse,
    AiKeyView,
    CreateAiKeyRequest,
    TestKeyRequest,
    TestKeyResponse,
    UpdateAiKeyRequest,
)
from app.services.ai_key_vault_service import DuplicateKeyNameError, ai_key_vault_service
from app.services.llm_settings_service import llm_settings_service

router = APIRouter(tags=["user-ai-keys"])


def _list_response(user_id: str, provider: str | None) -> AiKeyListResponse:
    return AiKeyListResponse(keys=[AiKeyView(**row) for row in ai_key_vault_service.list_for_user(user_id, provider)])


@router.get("/user-ai-keys", response_model=AiKeyListResponse)
def list_user_ai_keys(user: CurrentUser, provider: str | None = Query(default=None)) -> AiKeyListResponse:
    """List the user's registered AI keys, masked. Never the raw key."""
    return _list_response(user["user_id"], provider)


@router.post("/user-ai-keys", response_model=AiKeyView, status_code=status.HTTP_201_CREATED)
def create_user_ai_key(payload: CreateAiKeyRequest, user: CurrentUser) -> AiKeyView:
    """Register a new permanent, named AI key. A user may register several
    keys for the same provider; the first one becomes that provider's default."""
    try:
        row = ai_key_vault_service.create(
            user["user_id"], payload.provider, payload.nome, payload.api_key,
            apelido=payload.apelido, modelo_padrao=payload.modelo_padrao,
        )
    except DuplicateKeyNameError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    llm_settings_service.configured(user["user_id"], payload.provider)
    return AiKeyView(**row)


@router.patch("/user-ai-keys/{key_id}", response_model=AiKeyView)
def update_user_ai_key(key_id: str, payload: UpdateAiKeyRequest, user: CurrentUser) -> AiKeyView:
    """Update a key's display metadata. The encrypted value itself is
    immutable once created -- rotating a key means delete + recreate."""
    row = ai_key_vault_service.update(
        user["user_id"], key_id, nome=payload.nome, apelido=payload.apelido,
        modelo_padrao=payload.modelo_padrao, ativo=payload.ativo,
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chave não encontrada.")
    return AiKeyView(**row)


@router.post("/user-ai-keys/{key_id}/set-default", response_model=AiKeyView)
def set_default_user_ai_key(key_id: str, user: CurrentUser) -> AiKeyView:
    """Mark this key as the default used for its provider when an agent doesn't specify another."""
    row = ai_key_vault_service.set_default(user["user_id"], key_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chave não encontrada.")
    return AiKeyView(**row)


_PROVIDER_TEST_MODEL = {
    "anthropic": "claude-haiku-4-5",
    "openai": "gpt-4.1",
    "google": "gemini-2.5-flash",
    "openrouter": "deepseek/deepseek-r1:free",
    "deepseek": "deepseek-chat",
    "groq": "llama-3.3-70b-versatile",
    "ollama": "qwen2.5-coder:7b",
    "lmstudio": "local-model",
    "custom": "custom",
}


def _safe_message(exc: Exception, api_key: str) -> str:
    """Provider SDK exceptions can embed the raw key we just sent them (e.g. a
    REST transport that puts `key=...` in the request URL). redact_text()
    catches the common secret shapes; replacing the exact key we sent closes
    the gap for whatever pattern it doesn't recognize."""
    message = redact_text(str(exc))
    if api_key:
        message = message.replace(api_key, REDACTED)
    return message


@router.post("/user-ai-keys/test", response_model=TestKeyResponse)
def test_user_ai_key(payload: TestKeyRequest, user: CurrentUser) -> TestKeyResponse:
    """Validate a candidate key without storing it or echoing it back."""
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
        return TestKeyResponse(ok=False, provider=payload.provider, model=model, http_status=401, message=_safe_message(exc, payload.api_key))
    except Exception as exc:  # noqa: BLE001 - provider SDKs differ; surface exact message
        return TestKeyResponse(ok=False, provider=payload.provider, model=model, http_status=502, message=_safe_message(exc, payload.api_key))
    _ = user  # test endpoint doesn't persist or attribute to a specific key row
    return TestKeyResponse(ok=True, provider=payload.provider, model=response.model, http_status=200, message="Chave validada com sucesso.")


@router.delete("/user-ai-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_ai_key(key_id: str, user: CurrentUser) -> Response:
    """Remove one specific key. Does not affect other keys for the same provider."""
    if not ai_key_vault_service.delete(user["user_id"], key_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chave não encontrada.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
