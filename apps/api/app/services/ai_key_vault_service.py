from __future__ import annotations

from typing import Any

from app.repositories.user_ai_key_repository import UserAiKeyRepository
from app.repositories.user_repository import AuditLogRepository
from app.core.config import get_settings
from app.services.llm_provider_registry import PROVIDERS, normalize_provider_id


class DuplicateKeyNameError(Exception):
    """A friendly, service-layer-only validation error -- nome uniqueness per
    (user_id, provider) is not a DB constraint, since a hand-editable catalog
    of a few rows per user doesn't need one, and this keeps the migration
    simple."""


class NoAiKeyConfiguredError(Exception):
    """Raised by ensure_ready() when the required provider has no active,
    default key -- surfaces the vault 68 exact user-facing message via
    `message_key` for the caller to translate."""

    def __init__(self, provider: str) -> None:
        super().__init__(f"No active AI key configured for provider '{provider}'.")
        self.provider = provider
        self.message_key = "settings.ai.noKeyConfiguredMessage"


class AiKeyVaultService:
    """The spec's "AIKeyManager": wraps UserAiKeyRepository with validation,
    the pre-execution readiness gate, and connectivity testing. Replaces the
    old TTL-based UserKeySessionService -- keys here are permanent (no expiry)
    and multiple keys per provider are supported."""

    def __init__(self, repository: UserAiKeyRepository | None = None) -> None:
        self.repository = repository or UserAiKeyRepository()

    def _audit(self, user_id: str, event_code: str) -> None:
        try:
            AuditLogRepository(get_settings().sqlite_path).record(user_id=user_id, event_code=event_code)
        except Exception:  # noqa: BLE001
            pass

    def create(
        self, user_id: str, provider: str, nome: str, api_key: str, *,
        apelido: str | None = None, modelo_padrao: str | None = None,
    ) -> dict[str, Any]:
        canonical = normalize_provider_id(provider)
        existing = self.repository.list_for_user(user_id, canonical)
        if any(row["nome"] == nome for row in existing):
            raise DuplicateKeyNameError(f"Já existe uma chave chamada '{nome}' para este provedor.")
        row = self.repository.create(
            user_id, canonical, nome, api_key, apelido=apelido,
            modelo_padrao=modelo_padrao or PROVIDERS[canonical].default_model,
        )
        self._audit(user_id, "AI_KEY_CREATED")
        return row

    def list_for_user(self, user_id: str, provider: str | None = None) -> list[dict[str, Any]]:
        canonical = normalize_provider_id(provider) if provider else None
        return self.repository.list_for_user(user_id, canonical)

    def get_default_for_provider(self, user_id: str, provider: str) -> dict[str, Any] | None:
        return self.repository.get_default_for_provider(user_id, normalize_provider_id(provider))

    def get_decrypted_default(self, user_id: str, provider: str) -> str | None:
        return self.repository.get_decrypted_default(user_id, normalize_provider_id(provider))

    def set_default(self, user_id: str, key_id: str) -> dict[str, Any] | None:
        row = self.repository.set_default(user_id, key_id)
        if row is not None:
            self._audit(user_id, "AI_KEY_SET_DEFAULT")
        return row

    def update(
        self, user_id: str, key_id: str, *,
        nome: str | None = None, apelido: str | None = None,
        modelo_padrao: str | None = None, ativo: bool | None = None,
    ) -> dict[str, Any] | None:
        row = self.repository.update(
            user_id, key_id, nome=nome, apelido=apelido, modelo_padrao=modelo_padrao, ativo=ativo,
        )
        if row is not None:
            self._audit(user_id, "AI_KEY_UPDATED")
        return row

    def delete(self, user_id: str, key_id: str) -> bool:
        deleted = self.repository.delete(user_id, key_id)
        if deleted:
            self._audit(user_id, "AI_KEY_DELETED")
        return deleted

    def mark_validated(self, user_id: str, key_id: str, *, ok: bool) -> None:
        self.repository.mark_validated(user_id, key_id, ok=ok)

    def mark_used(self, user_id: str, provider: str) -> None:
        self.repository.mark_used(user_id, normalize_provider_id(provider))

    def ensure_ready(self, user_id: str, provider: str, model: str | None = None) -> None:
        """Pre-execution validation gate (vault 68): existe chave ativa? Se
        não, bloqueia antes de qualquer execução de agente."""
        del model  # model existence is validated by MODEL_REGISTRY at the router level
        canonical = normalize_provider_id(provider)
        definition = PROVIDERS[canonical]
        if not definition.key_required:
            return
        if self.repository.get_default_for_provider(user_id, canonical) is None:
            raise NoAiKeyConfiguredError(canonical)


ai_key_vault_service = AiKeyVaultService()
