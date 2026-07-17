from __future__ import annotations

from sqlalchemy import Boolean, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_oauth_identity", "oauth_provider", "oauth_subject", unique=True),
    )

    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    # Nullable: OAuth-only accounts (Google/GitHub) never set a password.
    hashed_password: Mapped[str | None] = mapped_column(Text, nullable=True)
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, default="user")
    locale: Mapped[str] = mapped_column(String, nullable=False, default="pt-BR")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Identifies the account as linked to a Google/GitHub login. Both null for
    # password-only accounts; a (provider, subject) pair is unique per account,
    # multiple NULLs are allowed by both SQLite and PostgreSQL unique indexes.
    oauth_provider: Mapped[str | None] = mapped_column(String, nullable=True)
    oauth_subject: Mapped[str | None] = mapped_column(String, nullable=True)
    consent_accepted_at: Mapped[str | None] = mapped_column(String, nullable=True)
    consent_policy_version: Mapped[str | None] = mapped_column(String, nullable=True)
    is_2fa_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Fernet-encrypted via app.core.security.encrypt_secret/decrypt_secret (same
    # pattern already used for git tokens / LLM provider keys). Set as soon as an
    # enrollment starts; only "live" once is_2fa_enabled flips true on verify.
    totp_secret_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    # A small (capped, resized client-side) profile image stored inline as a
    # `data:image/...;base64,` URL. Kept out of UserPublic on purpose so it does
    # not ride along on every /auth/me or token-refresh response -- fetched via
    # GET /auth/me/avatar instead.
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    __table_args__ = (
        Index("idx_refresh_tokens_user_id", "user_id"),
        Index("idx_refresh_tokens_expires_at", "expires_at"),
    )

    jti: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, nullable=False)
    expires_at: Mapped[str] = mapped_column(String, nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[str] = mapped_column(String, nullable=False)


class UserSession(Base):
    """One row per issued refresh token, carrying the device/IP context of the
    login or refresh that created it, so a user can see and revoke their own
    active sessions."""

    __tablename__ = "user_sessions"
    __table_args__ = (
        Index("idx_user_sessions_user_id", "user_id"),
        Index("idx_user_sessions_refresh_token_jti", "refresh_token_jti", unique=True),
    )

    session_id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, nullable=False)
    refresh_token_jti: Mapped[str | None] = mapped_column(String, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String, nullable=True)
    device_label: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    last_seen_at: Mapped[str] = mapped_column(String, nullable=False)
    revoked_at: Mapped[str | None] = mapped_column(String, nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("idx_audit_logs_user_id", "user_id"),
        Index("idx_audit_logs_event_code", "event_code"),
        Index("idx_audit_logs_created_at", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str | None] = mapped_column(String, nullable=True)
    event_code: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[str] = mapped_column(String, nullable=False)