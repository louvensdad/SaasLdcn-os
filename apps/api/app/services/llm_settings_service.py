from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.core.config import get_settings
from app.repositories.llm_active_selection_repository import LlmActiveSelectionRepository
from app.repositories.user_repository import AuditLogRepository
from app.data.model_registry import MODEL_REGISTRY
from app.schemas.llm_settings import ActiveLlmSettings, LlmResolution
from app.services.ai_key_vault_service import AiKeyVaultService, ai_key_vault_service
from app.services.llm_provider_registry import PROVIDERS, normalize_provider_id, provider_for_model


@dataclass
class _Selection:
    provider: str
    model: str
    last_validated_at: datetime | None = None
    last_used_at: datetime | None = None
    validation_status: str = "ready"

    @classmethod
    def from_row(cls, row: dict) -> "_Selection":
        return cls(
            provider=row["provider"], model=row["model"],
            last_validated_at=_parse(row.get("last_validated_at")),
            last_used_at=_parse(row.get("last_used_at")),
            validation_status=row.get("validation_status") or "ready",
        )


def _parse(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


@dataclass(frozen=True)
class LlmExecutionContext:
    resolution: LlmResolution
    api_key: str | None


class LlmRoutingKey(str):
    """Internal-only secret carrier that also pins the resolved global model."""

    model: str

    def __new__(cls, secret: str, model: str):
        value = str.__new__(cls, secret)
        value.model = model
        return value


class LlmSettingsService:
    """Source of truth for active LLM metadata; secrets remain in the TTL
    vault. The selection itself is DB-backed (LlmActiveSelectionRepository)
    so it survives a backend restart -- it used to live only in an in-memory
    dict, which silently reset to 'nothing configured' on every deploy."""

    def __init__(
        self, repository: LlmActiveSelectionRepository | None = None,
        key_vault: AiKeyVaultService | None = None,
    ) -> None:
        self.repository = repository or LlmActiveSelectionRepository()
        self.key_vault = key_vault or ai_key_vault_service

    def _audit(self, user_id: str, event_code: str) -> None:
        try:
            AuditLogRepository(get_settings().sqlite_path).record(user_id=user_id, event_code=event_code)
        except Exception:  # noqa: BLE001
            pass

    def configured(self, user_id: str, provider: str, *, model: str | None = None) -> None:
        canonical = normalize_provider_id(provider)
        definition = PROVIDERS[canonical]
        self.repository.set_if_absent(user_id, provider=canonical, model=model or definition.default_model)
        self._audit(user_id, "LLM_PROVIDER_CONFIGURED")

    def select(self, user_id: str, provider: str, *, model: str | None = None) -> ActiveLlmSettings:
        canonical = normalize_provider_id(provider)
        definition = PROVIDERS[canonical]
        selected_model = model or definition.default_model
        if provider_for_model(selected_model) != canonical:
            raise ValueError(f"Model '{selected_model}' does not belong to provider '{canonical}'.")
        self.repository.select(user_id, provider=canonical, model=selected_model)
        self._audit(user_id, "LLM_PROVIDER_SELECTED")
        return self.active(user_id)

    def validated(self, user_id: str, provider: str, *, ok: bool) -> None:
        canonical = normalize_provider_id(provider)
        self.repository.mark_validated(user_id, canonical, ok=ok)
        self._audit(user_id, "LLM_PROVIDER_TESTED" if ok else "LLM_PROVIDER_FAILED")

    def removed(self, user_id: str, provider: str | None) -> None:
        canonical = normalize_provider_id(provider) if provider is not None else None
        self.repository.remove(user_id, canonical)

    def _implicit_selection(self, user_id: str) -> _Selection | None:
        active_rows = [row for row in self.key_vault.list_for_user(user_id) if row["ativo"]]
        if not active_rows:
            return None
        canonical = normalize_provider_id(active_rows[0]["provider"])
        self.repository.set_if_absent(user_id, provider=canonical, model=PROVIDERS[canonical].default_model)
        row = self.repository.get(user_id)
        return _Selection.from_row(row) if row else None

    def active(self, user_id: str) -> ActiveLlmSettings:
        row = self.repository.get(user_id)
        selection = _Selection.from_row(row) if row else None
        selection = selection or self._implicit_selection(user_id)
        if selection is None:
            return ActiveLlmSettings(
                reason="Nenhum LLM configurado. Configure um provider ou use o modo determinístico."
            )
        definition = PROVIDERS[selection.provider]
        has_key = not definition.key_required or self.key_vault.get_default_for_provider(user_id, selection.provider) is not None
        resolved_status = selection.validation_status
        if definition.key_required and not has_key:
            resolved_status = "expired"
        mode = "llm" if resolved_status == "ready" and has_key else "deterministic"
        reason = (
            f"{definition.label} está configurado como LLM principal."
            if mode == "llm"
            else f"Não foi possível usar {definition.label}. A chave está ausente, inválida ou expirada."
        )
        context_tokens = MODEL_REGISTRY.get(selection.model or "", {}).get("ctx")
        return ActiveLlmSettings(
            provider=selection.provider, providerLabel=definition.label, model=selection.model,
            hasKey=has_key, status=resolved_status,  # type: ignore[arg-type]
            lastValidatedAt=selection.last_validated_at, lastUsedAt=selection.last_used_at,
            mode=mode, reason=reason, contextTokens=context_tokens,
        )

    def resolve(
        self, *, workspace_id: str | None, user_id: str, requested_capability: str,
        optional_override_provider: str | None = None, requested_model: str | None = None,
        deterministic: bool = False,
    ) -> LlmExecutionContext:
        del workspace_id
        if deterministic:
            self._audit(user_id, "LLM_FALLBACK_DETERMINISTIC_USED")
            return LlmExecutionContext(LlmResolution(
                mode="deterministic", reason="Modo determinístico escolhido explicitamente pelo usuário.",
                fallbackUsed=True, keyStatus="not_configured",
                requestedCapability=requested_capability,
            ), None)
        active = self.active(user_id)
        provider = (
            normalize_provider_id(optional_override_provider) if optional_override_provider
            else provider_for_model(requested_model) or active.provider
        )
        if provider is None:
            return LlmExecutionContext(LlmResolution(
                mode="deterministic",
                reason="Nenhum LLM configurado; confirmação de fallback determinístico é necessária.",
                fallbackUsed=True, keyStatus="not_configured",
                requestedCapability=requested_capability,
            ), None)
        definition = PROVIDERS[provider]
        model = requested_model if provider_for_model(requested_model) == provider else (
            active.model if active.provider == provider else definition.default_model
        )
        raw_key = None if not definition.key_required else self.key_vault.get_decrypted_default(user_id, provider)
        if definition.key_required and raw_key is None:
            # Auto-detection: the provider was *inferred from the requested model*
            # (not an explicit override) and it has no key, but the user's
            # configured provider is ready. Use the configured provider instead of
            # silently degrading to deterministic — "I set up an LLM once and the
            # whole flow uses it" must hold even when a model picker is mismatched.
            if (
                optional_override_provider is None
                and active.provider
                and active.provider != provider
                and active.mode == "llm"
                and (
                    not PROVIDERS[active.provider].key_required
                    or self.key_vault.get_decrypted_default(user_id, active.provider) is not None
                )
            ):
                provider = active.provider
                definition = PROVIDERS[provider]
                model = active.model or definition.default_model
                raw_key = None if not definition.key_required else self.key_vault.get_decrypted_default(user_id, provider)
            else:
                self._audit(user_id, "LLM_PROVIDER_FAILED")
                return LlmExecutionContext(LlmResolution(
                    provider=provider, providerLabel=definition.label, model=model,
                    mode="deterministic", reason=f"A chave de {definition.label} está ausente ou expirada.",
                    fallbackUsed=True, keyStatus="expired", requestedCapability=requested_capability,
                ), None)
        row = self.repository.get(user_id)
        if row and row["provider"] == provider:
            self.repository.mark_used(user_id, provider)
        if definition.key_required:
            self.key_vault.mark_used(user_id, provider)
        self._audit(user_id, "LLM_PROVIDER_CONFIRMED")
        return LlmExecutionContext(LlmResolution(
            provider=provider, providerLabel=definition.label, model=model, mode="llm",
            reason=f"Usar {definition.label} para {requested_capability}.",
            fallbackUsed=False, keyStatus="ready", requestedCapability=requested_capability,
        ), LlmRoutingKey(raw_key or "local-provider", model or definition.default_model))


llm_settings_service = LlmSettingsService()


class LlmProviderResolver:
    def resolve(self, **kwargs) -> LlmExecutionContext:  # noqa: ANN003
        return llm_settings_service.resolve(**kwargs)


llm_provider_resolver = LlmProviderResolver()
