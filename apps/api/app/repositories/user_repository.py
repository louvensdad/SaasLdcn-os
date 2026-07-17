from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import delete, func, select, text, update
from sqlalchemy.exc import IntegrityError

from app.core import runtime_overrides
from app.core.config import get_settings
from app.core.database import database_url_for, session_factory
from app.models.user import AuditLog, RefreshToken, User, UserSession


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class UserRepository:
    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self.sqlite_path = database if isinstance(database, Path) else get_settings().sqlite_path
        self._sessions = session_factory(self.database_url)

    def count_users(self) -> int:
        with self._sessions() as session:
            return int(session.scalar(select(func.count()).select_from(User)) or 0)

    def create_user(self, *, email: str, hashed_password: str, full_name: str, locale: str) -> dict[str, Any]:
        now = _now()
        with self._sessions.begin() as session:
            if session.bind is not None and session.bind.dialect.name == "postgresql":
                session.execute(text("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE"))
            role = "admin" if (session.scalar(select(func.count()).select_from(User)) or 0) == 0 else "user"
            model = User(
                user_id=f"user_{uuid4().hex[:12]}",
                email=email,
                hashed_password=hashed_password,
                full_name=full_name,
                role=role,
                locale=locale,
                is_active=True,
                consent_accepted_at=None,
                consent_policy_version=None,
                created_at=now,
                updated_at=now,
            )
            session.add(model)
            try:
                session.flush()
            except IntegrityError:
                raise
            return self._model_to_user(model)

    def get_by_email(self, email: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            model = session.scalar(select(User).where(User.email == email))
            return self._model_to_user(model) if model else None

    def get_by_id(self, user_id: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            model = session.get(User, user_id)
            return self._model_to_user(model) if model else None

    def get_by_oauth(self, provider: str, subject: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            model = session.scalar(
                select(User).where(User.oauth_provider == provider, User.oauth_subject == subject)
            )
            return self._model_to_user(model) if model else None

    def create_oauth_user(
        self, *, email: str, full_name: str, locale: str, oauth_provider: str, oauth_subject: str
    ) -> dict[str, Any]:
        now = _now()
        with self._sessions.begin() as session:
            if session.bind is not None and session.bind.dialect.name == "postgresql":
                session.execute(text("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE"))
            role = "admin" if (session.scalar(select(func.count()).select_from(User)) or 0) == 0 else "user"
            model = User(
                user_id=f"user_{uuid4().hex[:12]}",
                email=email,
                hashed_password=None,
                full_name=full_name,
                role=role,
                locale=locale,
                is_active=True,
                oauth_provider=oauth_provider,
                oauth_subject=oauth_subject,
                consent_accepted_at=None,
                consent_policy_version=None,
                created_at=now,
                updated_at=now,
            )
            session.add(model)
            session.flush()
            return self._model_to_user(model)

    def link_oauth(self, user_id: str, provider: str, subject: str) -> dict[str, Any] | None:
        with self._sessions.begin() as session:
            model = session.get(User, user_id)
            if model is None:
                return None
            model.oauth_provider = provider
            model.oauth_subject = subject
            model.updated_at = _now()
        return self.get_by_id(user_id)

    def update_profile(self, user_id: str, *, full_name: str | None = None, locale: str | None = None) -> dict[str, Any] | None:
        with self._sessions.begin() as session:
            model = session.get(User, user_id)
            if model is None:
                return None
            if full_name is not None:
                model.full_name = full_name
            if locale is not None:
                model.locale = locale
            model.updated_at = _now()
        return self.get_by_id(user_id)

    def set_password(self, user_id: str, hashed_password: str) -> None:
        with self._sessions.begin() as session:
            session.execute(update(User).where(User.user_id == user_id).values(hashed_password=hashed_password, updated_at=_now()))

    def get_hashed_password(self, user_id: str) -> str | None:
        with self._sessions() as session:
            return session.scalar(select(User.hashed_password).where(User.user_id == user_id))

    def record_consent(self, user_id: str, policy_version: str) -> dict[str, Any] | None:
        now = _now()
        with self._sessions.begin() as session:
            result = session.execute(
                update(User)
                .where(User.user_id == user_id)
                .values(consent_accepted_at=now, consent_policy_version=policy_version, updated_at=now)
            )
            if not result.rowcount:
                return None
        return self.get_by_id(user_id)

    def anonymize_user(self, user_id: str) -> bool:
        now = _now()
        with self._sessions.begin() as session:
            model = session.get(User, user_id)
            if model is None:
                return False
            model.email = f"deleted-{user_id}@anonymized.invalid"
            model.hashed_password = ""
            model.full_name = "Deleted user"
            model.is_active = False
            model.consent_accepted_at = None
            model.consent_policy_version = None
            model.is_2fa_enabled = False
            model.totp_secret_encrypted = None
            model.updated_at = now
            session.execute(update(RefreshToken).where(RefreshToken.user_id == user_id).values(revoked=True))
            session.execute(
                update(UserSession)
                .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
                .values(revoked_at=now)
            )
        return True

    def store_refresh_token(self, *, jti: str, user_id: str, expires_at: str) -> None:
        with self._sessions.begin() as session:
            session.add(RefreshToken(jti=jti, user_id=user_id, expires_at=expires_at, revoked=False, created_at=_now()))

    def get_refresh_token(self, jti: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            model = session.get(RefreshToken, jti)
            if model is None:
                return None
            return {"jti": model.jti, "user_id": model.user_id, "expires_at": model.expires_at, "revoked": model.revoked, "created_at": model.created_at}

    def revoke_refresh_token(self, jti: str) -> None:
        with self._sessions.begin() as session:
            session.execute(update(RefreshToken).where(RefreshToken.jti == jti).values(revoked=True))

    def revoke_all_refresh_tokens(self, user_id: str) -> None:
        with self._sessions.begin() as session:
            session.execute(update(RefreshToken).where(RefreshToken.user_id == user_id).values(revoked=True))

    def purge_expired_refresh_tokens(self) -> None:
        with self._sessions.begin() as session:
            session.execute(delete(RefreshToken).where(RefreshToken.expires_at < _now()))

    @staticmethod
    def _model_to_user(model: User) -> dict[str, Any]:
        return {
            "user_id": model.user_id,
            "email": model.email,
            "hashed_password": model.hashed_password,
            "full_name": model.full_name,
            "role": model.role,
            "locale": model.locale,
            "is_active": bool(model.is_active),
            "oauth_provider": model.oauth_provider,
            "oauth_subject": model.oauth_subject,
            "consent_accepted_at": model.consent_accepted_at,
            "consent_policy_version": model.consent_policy_version,
            "is_2fa_enabled": bool(model.is_2fa_enabled),
            "created_at": model.created_at,
            "updated_at": model.updated_at,
        }

    # ------------------------------------------------------------------
    # Two-factor authentication (TOTP)
    # ------------------------------------------------------------------
    def get_totp_secret_encrypted(self, user_id: str) -> str | None:
        """Deliberately separate from `_model_to_user`: the encrypted secret
        should never ride along in the general-purpose user dict that flows
        into `UserPublic`/export/audit paths."""
        with self._sessions() as session:
            return session.scalar(select(User.totp_secret_encrypted).where(User.user_id == user_id))

    def set_pending_totp_secret(self, user_id: str, encrypted_secret: str) -> None:
        with self._sessions.begin() as session:
            session.execute(
                update(User)
                .where(User.user_id == user_id)
                .values(totp_secret_encrypted=encrypted_secret, updated_at=_now())
            )

    def enable_2fa(self, user_id: str) -> None:
        with self._sessions.begin() as session:
            session.execute(
                update(User).where(User.user_id == user_id).values(is_2fa_enabled=True, updated_at=_now())
            )

    def disable_2fa(self, user_id: str) -> None:
        with self._sessions.begin() as session:
            session.execute(
                update(User)
                .where(User.user_id == user_id)
                .values(is_2fa_enabled=False, totp_secret_encrypted=None, updated_at=_now())
            )

    # ------------------------------------------------------------------
    # Profile avatar (inline data URL, kept out of the general user dict)
    # ------------------------------------------------------------------
    def get_avatar(self, user_id: str) -> str | None:
        with self._sessions() as session:
            return session.scalar(select(User.avatar_url).where(User.user_id == user_id))

    def set_avatar(self, user_id: str, avatar_url: str | None) -> bool:
        with self._sessions.begin() as session:
            result = session.execute(
                update(User).where(User.user_id == user_id).values(avatar_url=avatar_url, updated_at=_now())
            )
            return bool(result.rowcount)

    # ------------------------------------------------------------------
    # Account deactivation (reversible-in-spirit: is_active=False blocks login)
    # ------------------------------------------------------------------
    def deactivate(self, user_id: str) -> bool:
        now = _now()
        with self._sessions.begin() as session:
            model = session.get(User, user_id)
            if model is None:
                return False
            model.is_active = False
            model.updated_at = now
            session.execute(update(RefreshToken).where(RefreshToken.user_id == user_id).values(revoked=True))
            session.execute(
                update(UserSession)
                .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
                .values(revoked_at=now)
            )
        return True

    # ------------------------------------------------------------------
    # Consent revocation
    # ------------------------------------------------------------------
    def revoke_consent(self, user_id: str) -> dict[str, Any] | None:
        with self._sessions.begin() as session:
            result = session.execute(
                update(User).where(User.user_id == user_id).values(consent_accepted_at=None, updated_at=_now())
            )
            if not result.rowcount:
                return None
        return self.get_by_id(user_id)

    # ------------------------------------------------------------------
    # Login sessions (device/IP-aware, one row per issued refresh token)
    # ------------------------------------------------------------------
    def create_session(
        self, *, user_id: str, refresh_token_jti: str, ip_address: str | None, device_label: str | None
    ) -> dict[str, Any]:
        now = _now()
        with self._sessions.begin() as session:
            model = UserSession(
                session_id=f"session_{uuid4().hex[:12]}",
                user_id=user_id,
                refresh_token_jti=refresh_token_jti,
                ip_address=ip_address,
                device_label=device_label,
                created_at=now,
                last_seen_at=now,
                revoked_at=None,
            )
            session.add(model)
            session.flush()
            return self._model_to_session(model)

    def rotate_session(
        self, *, old_jti: str, new_jti: str, ip_address: str | None, device_label: str | None
    ) -> dict[str, Any] | None:
        """Carry a session forward across a refresh-token rotation: same
        session_id/created_at (so "member since"-style displays stay stable),
        new jti + refreshed last_seen_at/ip/device."""
        with self._sessions.begin() as session:
            model = session.scalar(select(UserSession).where(UserSession.refresh_token_jti == old_jti))
            if model is None or model.revoked_at is not None:
                return None
            model.refresh_token_jti = new_jti
            model.last_seen_at = _now()
            if ip_address is not None:
                model.ip_address = ip_address
            if device_label is not None:
                model.device_label = device_label
            session.flush()
            return self._model_to_session(model)

    def list_sessions(self, user_id: str) -> Sequence[dict[str, Any]]:
        with self._sessions() as session:
            rows = session.scalars(
                select(UserSession)
                .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
                .order_by(UserSession.last_seen_at.desc())
            ).all()
            return [self._model_to_session(row) for row in rows]

    def revoke_session(self, session_id: str, user_id: str) -> str | None:
        """Revokes the session row and returns its refresh_token_jti (so the
        caller can also revoke the underlying refresh token), or None if no
        matching active session exists for this user."""
        with self._sessions.begin() as session:
            model = session.scalar(
                select(UserSession).where(
                    UserSession.session_id == session_id,
                    UserSession.user_id == user_id,
                    UserSession.revoked_at.is_(None),
                )
            )
            if model is None:
                return None
            model.revoked_at = _now()
            return model.refresh_token_jti

    def revoke_other_sessions(self, user_id: str, keep_jti: str | None) -> Sequence[str]:
        """Revokes every other active session for this user and returns the
        refresh_token_jti of each one revoked, so the caller can also revoke
        the underlying refresh tokens."""
        with self._sessions.begin() as session:
            query = select(UserSession).where(
                UserSession.user_id == user_id,
                UserSession.revoked_at.is_(None),
            )
            if keep_jti:
                query = query.where(UserSession.refresh_token_jti != keep_jti)
            rows = session.scalars(query).all()
            revoked_jtis = []
            now = _now()
            for row in rows:
                row.revoked_at = now
                if row.refresh_token_jti:
                    revoked_jtis.append(row.refresh_token_jti)
            return revoked_jtis

    def revoke_session_by_jti(self, jti: str) -> None:
        with self._sessions.begin() as session:
            session.execute(
                update(UserSession)
                .where(UserSession.refresh_token_jti == jti, UserSession.revoked_at.is_(None))
                .values(revoked_at=_now())
            )

    def revoke_all_sessions(self, user_id: str) -> None:
        with self._sessions.begin() as session:
            session.execute(
                update(UserSession)
                .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
                .values(revoked_at=_now())
            )

    @staticmethod
    def _model_to_session(model: UserSession) -> dict[str, Any]:
        return {
            "session_id": model.session_id,
            "refresh_token_jti": model.refresh_token_jti,
            "ip_address": model.ip_address,
            "device_label": model.device_label,
            "created_at": model.created_at,
            "last_seen_at": model.last_seen_at,
        }


class AuditLogRepository:
    SAFE_EVENT_CODES = {
        "user_registered", "user_login", "user_login_failed", "user_logout",
        "user_password_changed", "user_consent_recorded", "user_data_exported",
        "user_account_deleted", "token_refreshed", "quality_gate_run",
        "quality_gate_failed", "auto_repair_started", "auto_repair_action_applied",
        "auto_repair_failed", "auto_repair_completed", "revalidation_run",
        "llm_repair_started", "llm_repair_action_applied", "llm_repair_failed", "llm_repair_completed",
        "runtime_audit_started", "runtime_audit_completed", "runtime_audit_failed", "runtime_audit_crash_detected",
        "runtime_functional_test_started", "runtime_functional_test_completed",
        "runtime_functional_test_failed", "runtime_functional_test_crash_detected",
        "force_release_requested", "force_release_confirmed", "git_export_blocked",
        "user_2fa_enabled", "user_2fa_disabled", "user_session_revoked",
        "user_sessions_revoked_all", "user_consent_revoked", "user_activity_exported",
        "user_avatar_updated", "user_avatar_removed", "user_account_deactivated",
        "modernize_project_uploaded", "modernize_git_imported", "llm_provider_selected",
        "llm_connection_tested", "codebase_analysis_started", "codebase_analysis_completed",
        "modernization_plan_approved", "auto_refactor_started", "auto_refactor_completed",
        "revalidation_started", "revalidation_completed", "modernized_project_exported",
        "LLM_PROVIDER_CONFIGURED", "LLM_PROVIDER_SELECTED", "LLM_PROVIDER_CONFIRMED",
        "LLM_PROVIDER_TESTED", "LLM_PROVIDER_FAILED", "LLM_FALLBACK_DETERMINISTIC_USED",
        "LLM_ACTION_STARTED", "LLM_ACTION_COMPLETED",
        "laboratory_terminal_run",
        "generation_job_blocked_by_gate", "blueprint_approved",
    }

    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self.sqlite_path = database if isinstance(database, Path) else get_settings().sqlite_path
        self._sessions = session_factory(self.database_url)

    def record(self, *, user_id: str | None, event_code: str) -> None:
        safe_code = event_code if event_code in self.SAFE_EVENT_CODES else "unknown_event"
        with self._sessions.begin() as session:
            session.add(AuditLog(id=f"audit_{uuid4().hex[:12]}", user_id=user_id, event_code=safe_code, created_at=_now()))

    def list_for_user(self, user_id: str) -> Sequence[dict[str, Any]]:
        with self._sessions() as session:
            rows = session.scalars(select(AuditLog).where(AuditLog.user_id == user_id).order_by(AuditLog.created_at.desc())).all()
            return [{"id": row.id, "event_code": row.event_code, "created_at": row.created_at} for row in rows]

    def purge_expired(self) -> None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=runtime_overrides.get_audit_log_retention_days())
        with self._sessions.begin() as session:
            session.execute(delete(AuditLog).where(AuditLog.created_at < cutoff.replace(microsecond=0).isoformat()))