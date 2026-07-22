from __future__ import annotations

import time
from datetime import datetime, timezone
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
    "deepseek": "deepseek-v4-flash",
    "groq": "llama-3.3-70b-versatile",
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


def _test_key(provider: str, api_key: str, *, model: str | None = None) -> TestKeyResponse:
    from app.engines.llm.base import LLMError
    from app.engines.llm.router import LLMRouter
    from app.schemas.llm import LLMRequest

    selected_model = model or _PROVIDER_TEST_MODEL[provider]
    started = time.perf_counter()
    validated_at = datetime.now(timezone.utc).isoformat()
    try:
        response = LLMRouter().route(
            LLMRequest(
                system="Return exactly: ok",
                user="Connectivity test. Return exactly: ok",
                max_output_tokens=8,
                timeout_ms=20_000,
                cache_prefix=False,
            ),
            user_choice=selected_model,
            api_key=api_key,
        )
    except LLMError as exc:
        return TestKeyResponse(
            ok=False, provider=provider, model=selected_model,
            http_status=exc.status_code or 502, message=_safe_message(exc, api_key),
            latency_ms=int((time.perf_counter() - started) * 1000), validated_at=validated_at,
        )
    except Exception as exc:  # noqa: BLE001 - normalized into the public provider contract
        return TestKeyResponse(
            ok=False, provider=provider, model=selected_model, http_status=502,
            message=_safe_message(exc, api_key),
            latency_ms=int((time.perf_counter() - started) * 1000), validated_at=validated_at,
        )
    return TestKeyResponse(
        ok=True, provider=provider, model=response.model, http_status=200,
        message="Conectado.", latency_ms=int((time.perf_counter() - started) * 1000),
        validated_at=validated_at,
    )


def _persist_test_result(user_id: str, key_id: str, provider: str, result: TestKeyResponse) -> None:
    if result.ok:
        key_status, engine_status = "valid", "ready"
    elif result.http_status in {401, 403}:
        key_status, engine_status = "invalid", "auth_error"
    else:
        key_status, engine_status = "unavailable", "unavailable"
    ai_key_vault_service.mark_validated(user_id, key_id, status=key_status)
    llm_settings_service.validated(user_id, provider, status=engine_status)


@router.post("/user-ai-keys/test", response_model=TestKeyResponse)
def test_user_ai_key(payload: TestKeyRequest, user: CurrentUser) -> TestKeyResponse:
    """Validate a candidate key without storing it or echoing it back."""
    _ = user
    return _test_key(payload.provider, payload.api_key)


@router.post("/user-ai-keys/{key_id}/test", response_model=TestKeyResponse)
def test_saved_user_ai_key(key_id: str, user: CurrentUser) -> TestKeyResponse:
    """Validate the encrypted, persisted key and update the canonical state."""
    row = ai_key_vault_service.get_for_user(user["user_id"], key_id)
    api_key = ai_key_vault_service.get_decrypted(user["user_id"], key_id)
    if row is None or api_key is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chave não encontrada.")
    result = _test_key(row["provider"], api_key, model=row.get("modelo_padrao"))
    _persist_test_result(user["user_id"], key_id, row["provider"], result)
    return result


@router.delete("/user-ai-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_ai_key(key_id: str, user: CurrentUser) -> Response:
    """Remove one specific key. Does not affect other keys for the same provider."""
    if not ai_key_vault_service.delete(user["user_id"], key_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chave não encontrada.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
