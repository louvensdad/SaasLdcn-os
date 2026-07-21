from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.core.database import database_url_for, session_factory
from app.core.security import decrypt_secret, encrypt_secret
from app.models.persistence import UserAiKey


def mask_key(raw: str) -> str:
    raw = raw.strip()
    if len(raw) <= 8:
        return "•" * len(raw)
    return f"{raw[:4]}…{raw[-4:]}"


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _as_dict(row: UserAiKey) -> dict[str, Any]:
    return {
        "id": row.id, "provider": row.provider, "nome": row.nome, "apelido": row.apelido,
        "masked": row.masked, "modelo_padrao": row.modelo_padrao, "status": row.status,
        "ativo": row.ativo, "is_default": row.is_default_for_provider,
        "created_at": row.created_at, "last_used_at": row.last_used_at,
        "last_validated_at": row.last_validated_at,
    }


class UserAiKeyRepository:
    """Permanent, named, multi-key-per-provider BYOK vault (vault 68 - Gestão
    de Chaves de IA). No TTL: rows persist until explicitly deleted. Keys are
    immutable once created -- rotation is delete+recreate, so `update()` only
    ever touches display metadata, never `encrypted_key`."""

    def __init__(self, database: str | None = None) -> None:
        self._sessions = session_factory(database_url_for(database))

    def create(
        self, user_id: str, provider: str, nome: str, api_key: str, *,
        apelido: str | None = None, modelo_padrao: str | None = None,
    ) -> dict[str, Any]:
        row = UserAiKey(
            id=f"aik_{uuid4().hex[:12]}", user_id=user_id, provider=provider, nome=nome,
            apelido=apelido, encrypted_key=encrypt_secret(api_key), masked=mask_key(api_key),
            modelo_padrao=modelo_padrao, status="untested", ativo=True,
            is_default_for_provider=False, created_at=_now(),
        )
        with self._sessions.begin() as session:
            existing_default = session.scalar(
                select(UserAiKey).where(UserAiKey.user_id == user_id, UserAiKey.provider == provider)
            )
            if existing_default is None:
                # First key registered for this provider becomes its default automatically.
                row.is_default_for_provider = True
            session.add(row)
            session.flush()
            return _as_dict(row)

    def list_for_user(self, user_id: str, provider: str | None = None) -> list[dict[str, Any]]:
        with self._sessions() as session:
            stmt = select(UserAiKey).where(UserAiKey.user_id == user_id)
            if provider is not None:
                stmt = stmt.where(UserAiKey.provider == provider)
            rows = session.scalars(stmt.order_by(UserAiKey.provider, UserAiKey.created_at)).all()
            return [_as_dict(row) for row in rows]

    def get_default_for_provider(self, user_id: str, provider: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            row = session.scalar(
                select(UserAiKey).where(
                    UserAiKey.user_id == user_id, UserAiKey.provider == provider,
                    UserAiKey.ativo.is_(True), UserAiKey.is_default_for_provider.is_(True),
                )
            )
            return _as_dict(row) if row else None

    def get_decrypted(self, user_id: str, key_id: str) -> str | None:
        with self._sessions() as session:
            row = session.get(UserAiKey, key_id)
            if row is None or row.user_id != user_id:
                return None
            return decrypt_secret(row.encrypted_key)

    def get_decrypted_default(self, user_id: str, provider: str) -> str | None:
        with self._sessions() as session:
            row = session.scalar(
                select(UserAiKey).where(
                    UserAiKey.user_id == user_id, UserAiKey.provider == provider,
                    UserAiKey.ativo.is_(True), UserAiKey.is_default_for_provider.is_(True),
                )
            )
            return decrypt_secret(row.encrypted_key) if row else None

    def set_default(self, user_id: str, key_id: str) -> dict[str, Any] | None:
        with self._sessions.begin() as session:
            target = session.get(UserAiKey, key_id)
            if target is None or target.user_id != user_id:
                return None
            others = session.scalars(
                select(UserAiKey).where(
                    UserAiKey.user_id == user_id, UserAiKey.provider == target.provider,
                    UserAiKey.id != key_id,
                )
            ).all()
            for other in others:
                other.is_default_for_provider = False
            target.is_default_for_provider = True
            session.flush()
            return _as_dict(target)

    def update(
        self, user_id: str, key_id: str, *,
        nome: str | None = None, apelido: str | None = None,
        modelo_padrao: str | None = None, ativo: bool | None = None,
    ) -> dict[str, Any] | None:
        with self._sessions.begin() as session:
            row = session.get(UserAiKey, key_id)
            if row is None or row.user_id != user_id:
                return None
            if nome is not None:
                row.nome = nome
            if apelido is not None:
                row.apelido = apelido
            if modelo_padrao is not None:
                row.modelo_padrao = modelo_padrao
            if ativo is not None:
                row.ativo = ativo
            session.flush()
            return _as_dict(row)

    def mark_validated(self, user_id: str, key_id: str, *, ok: bool) -> None:
        with self._sessions.begin() as session:
            row = session.get(UserAiKey, key_id)
            if row is None or row.user_id != user_id:
                return
            row.status = "valid" if ok else "invalid"
            row.last_validated_at = _now()

    def mark_used(self, user_id: str, provider: str) -> None:
        with self._sessions.begin() as session:
            row = session.scalar(
                select(UserAiKey).where(
                    UserAiKey.user_id == user_id, UserAiKey.provider == provider,
                    UserAiKey.ativo.is_(True), UserAiKey.is_default_for_provider.is_(True),
                )
            )
            if row is not None:
                row.last_used_at = _now()

    def delete(self, user_id: str, key_id: str) -> bool:
        with self._sessions.begin() as session:
            row = session.get(UserAiKey, key_id)
            if row is None or row.user_id != user_id:
                return False
            was_default = row.is_default_for_provider
            provider = row.provider
            session.delete(row)
            session.flush()
            if was_default:
                # Promote the oldest remaining active key for that provider, if any.
                successor = session.scalar(
                    select(UserAiKey).where(
                        UserAiKey.user_id == user_id, UserAiKey.provider == provider,
                        UserAiKey.ativo.is_(True),
                    ).order_by(UserAiKey.created_at)
                )
                if successor is not None:
                    successor.is_default_for_provider = True
            return True
