from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import UTC, datetime

from app.core.config import get_settings
from app.repositories.user_repository import AuditLogRepository
from app.schemas.llm_settings import ActiveLlmSettings, LlmResolution
from app.services.llm_provider_registry import PROVIDERS, normalize_provider_id, provider_for_model
from app.services.user_key_session_service import user_key_session


@dataclass
class _Selection:
    provider: str
    model: str
    last_validated_at: datetime | None = None
    last_used_at: datetime | None = None
    validation_status: str = "ready"


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
    """Source of truth for active LLM metadata; secrets remain in the TTL vault."""

    def __init__(self) -> None:
        self._selections: dict[str, _Selection] = {}
        self._lock = threading.RLock()

    def _audit(self, user_id: str, event_code: str) -> None:
        try:
            AuditLogRepository(get_settings().sqlite_path).record(user_id=user_id, event_code=event_code)
        except Exception:  # noqa: BLE001
            pass

    def configured(self, user_id: str, provider: str, *, model: str | None = None) -> None:
        canonical = normalize_provider_id(provider)
        definition = PROVIDERS[canonical]
        with self._lock:
            self._selections.setdefault(
                user_id, _Selection(canonical, model or definition.default_model)
            )
        self._audit(user_id, "LLM_PROVIDER_CONFIGURED")

    def select(self, user_id: str, provider: str, *, model: str | None = None) -> ActiveLlmSettings:
        canonical = normalize_provider_id(provider)
        definition = PROVIDERS[canonical]
        selected_model = model or definition.default_model
        if provider_for_model(selected_model) != canonical:
            raise ValueError(f"Model '{selected_model}' does not belong to provider '{canonical}'.")
        with self._lock:
            self._selections[user_id] = _Selection(canonical, selected_model)
        self._audit(user_id, "LLM_PROVIDER_SELECTED")
        return self.active(user_id)

    def validated(self, user_id: str, provider: str, *, ok: bool) -> None:
        canonical = normalize_provider_id(provider)
        with self._lock:
            selection = self._selections.get(user_id)
            if selection and selection.provider == canonical:
                selection.validation_status = "ready" if ok else "invalid"
                selection.last_validated_at = datetime.now(UTC)
        self._audit(user_id, "LLM_PROVIDER_TESTED" if ok else "LLM_PROVIDER_FAILED")

    def removed(self, user_id: str, provider: str | None) -> None:
        with self._lock:
            selection = self._selections.get(user_id)
            if provider is None or (
                selection is not None and selection.provider == normalize_provider_id(provider)
            ):
                self._selections.pop(user_id, None)

    def _implicit_selection(self, user_id: str) -> _Selection | None:
        sessions = user_key_session.status(user_id)
        if not sessions:
            return None
        canonical = normalize_provider_id(sessions[0][0])
        selection = _Selection(canonical, PROVIDERS[canonical].default_model)
        with self._lock:
            self._selections.setdefault(user_id, selection)
            return self._selections[user_id]

    def active(self, user_id: str) -> ActiveLlmSettings:
        with self._lock:
            selection = self._selections.get(user_id)
        selection = selection or self._implicit_selection(user_id)
        if selection is None:
            return ActiveLlmSettings(
                reason="Nenhum LLM configurado. Configure um provider ou use o modo determinÃ­stico."
            )
        definition = PROVIDERS[selection.provider]
        has_key = not definition.key_required or user_key_session.get(user_id, selection.provider) is not None
        resolved_status = selection.validation_status
        if definition.key_required and not has_key:
            resolved_status = "expired"
        mode = "llm" if resolved_status == "ready" and has_key else "deterministic"
        reason = (
            f"{definition.label} estÃ¡ configurado como LLM principal."
            if mode == "llm"
            else f"NÃ£o foi possÃ­vel usar {definition.label}. A chave estÃ¡ ausente, invÃ¡lida ou expirada."
        )
        return ActiveLlmSettings(
            provider=selection.provider, providerLabel=definition.label, model=selection.model,
            hasKey=has_key, status=resolved_status,  # type: ignore[arg-type]
            lastValidatedAt=selection.last_validated_at, lastUsedAt=selection.last_used_at,
            mode=mode, reason=reason,
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
                mode="deterministic", reason="Modo determinÃ­stico escolhido explicitamente pelo usuÃ¡rio.",
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
                reason="Nenhum LLM configurado; confirmaÃ§Ã£o de fallback determinÃ­stico Ã© necessÃ¡ria.",
                fallbackUsed=True, keyStatus="not_configured",
                requestedCapability=requested_capability,
            ), None)
        definition = PROVIDERS[provider]
        model = requested_model if provider_for_model(requested_model) == provider else (
            active.model if active.provider == provider else definition.default_model
        )
        raw_key = None if not definition.key_required else user_key_session.get(user_id, provider)
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
                    or user_key_session.get(user_id, active.provider) is not None
                )
            ):
                provider = active.provider
                definition = PROVIDERS[provider]
                model = active.model or definition.default_model
                raw_key = None if not definition.key_required else user_key_session.get(user_id, provider)
            else:
                self._audit(user_id, "LLM_PROVIDER_FAILED")
                return LlmExecutionContext(LlmResolution(
                    provider=provider, providerLabel=definition.label, model=model,
                    mode="deterministic", reason=f"A chave de {definition.label} estÃ¡ ausente ou expirada.",
                    fallbackUsed=True, keyStatus="expired", requestedCapability=requested_capability,
                ), None)
        with self._lock:
            selection = self._selections.get(user_id)
            if selection and selection.provider == provider:
                selection.last_used_at = datetime.now(UTC)
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
