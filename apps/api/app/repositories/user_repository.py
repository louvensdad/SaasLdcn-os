from __future__ import annotations

import sqlite3
from collections.abc import Sequence
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.core.config import get_settings


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class UserRepository:
    """SQLite-backed storage for user accounts and refresh tokens.

    The first account ever created on a given database becomes 'admin';
    every subsequent account is created with the 'user' role. This matches
    the single-tenant, self-hosted nature of LDCN OS (no separate admin
    bootstrap step is required).
    """

    def __init__(self, sqlite_path: Path | None = None) -> None:
        self.sqlite_path = sqlite_path or get_settings().sqlite_path

    @contextmanager
    def connection(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.sqlite_path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def initialize(self) -> None:
        with self.connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    user_id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    hashed_password TEXT NOT NULL,
                    full_name TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'user',
                    locale TEXT NOT NULL DEFAULT 'pt-BR',
                    is_active INTEGER NOT NULL DEFAULT 1,
                    consent_accepted_at TEXT,
                    consent_policy_version TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS refresh_tokens (
                    jti TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    revoked INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)")
        self.purge_expired_refresh_tokens()

    # ------------------------------------------------------------------
    # Users
    # ------------------------------------------------------------------
    def count_users(self) -> int:
        with self.connection() as conn:
            return conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]

    def create_user(self, *, email: str, hashed_password: str, full_name: str, locale: str) -> dict[str, Any]:
        now = _now()
        role = "admin" if self.count_users() == 0 else "user"
        record = {
            "user_id": f"user_{uuid4().hex[:12]}",
            "email": email,
            "hashed_password": hashed_password,
            "full_name": full_name,
            "role": role,
            "locale": locale,
            "is_active": 1,
            "consent_accepted_at": None,
            "consent_policy_version": None,
            "created_at": now,
            "updated_at": now,
        }
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO users (
                    user_id, email, hashed_password, full_name, role, locale,
                    is_active, consent_accepted_at, consent_policy_version, created_at, updated_at
                ) VALUES (
                    :user_id, :email, :hashed_password, :full_name, :role, :locale,
                    :is_active, :consent_accepted_at, :consent_policy_version, :created_at, :updated_at
                )
                """,
                record,
            )
        return self._row_to_user(record)

    def get_by_email(self, email: str) -> dict[str, Any] | None:
        with self.connection() as conn:
            row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        return self._row_to_user(dict(row)) if row else None

    def get_by_id(self, user_id: str) -> dict[str, Any] | None:
        with self.connection() as conn:
            row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
        return self._row_to_user(dict(row)) if row else None

    def update_profile(self, user_id: str, *, full_name: str | None = None, locale: str | None = None) -> dict[str, Any] | None:
        current = self.get_by_id(user_id)
        if current is None:
            return None
        updated_full_name = full_name if full_name is not None else current["full_name"]
        updated_locale = locale if locale is not None else current["locale"]
        now = _now()
        with self.connection() as conn:
            conn.execute(
                "UPDATE users SET full_name = ?, locale = ?, updated_at = ? WHERE user_id = ?",
                (updated_full_name, updated_locale, now, user_id),
            )
        return self.get_by_id(user_id)

    def set_password(self, user_id: str, hashed_password: str) -> None:
        now = _now()
        with self.connection() as conn:
            conn.execute(
                "UPDATE users SET hashed_password = ?, updated_at = ? WHERE user_id = ?",
                (hashed_password, now, user_id),
            )

    def get_hashed_password(self, user_id: str) -> str | None:
        with self.connection() as conn:
            row = conn.execute("SELECT hashed_password FROM users WHERE user_id = ?", (user_id,)).fetchone()
        return row["hashed_password"] if row else None

    def record_consent(self, user_id: str, policy_version: str) -> dict[str, Any] | None:
        now = _now()
        with self.connection() as conn:
            conn.execute(
                "UPDATE users SET consent_accepted_at = ?, consent_policy_version = ?, updated_at = ? WHERE user_id = ?",
                (now, policy_version, now, user_id),
            )
        return self.get_by_id(user_id)

    def anonymize_user(self, user_id: str) -> bool:
        """LGPD Art. 18 (right to erasure): irreversibly anonymize a user account.

        We anonymize rather than hard-delete the row so that referential data
        (audit trail) keeps a stable, non-identifying user_id. The email is
        replaced with a non-reversible placeholder, the password hash is
        cleared so the account can never authenticate again, and all
        outstanding refresh tokens are revoked.
        """
        now = _now()
        with self.connection() as conn:
            existing = conn.execute("SELECT 1 FROM users WHERE user_id = ?", (user_id,)).fetchone()
            if existing is None:
                return False
            conn.execute(
                """
                UPDATE users
                SET email = ?, hashed_password = '', full_name = ?, is_active = 0,
                    consent_accepted_at = NULL, consent_policy_version = NULL, updated_at = ?
                WHERE user_id = ?
                """,
                (f"deleted-{user_id}@anonymized.invalid", "Deleted user", now, user_id),
            )
            conn.execute("UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?", (user_id,))
        return True

    # ------------------------------------------------------------------
    # Refresh tokens
    # ------------------------------------------------------------------
    def store_refresh_token(self, *, jti: str, user_id: str, expires_at: str) -> None:
        with self.connection() as conn:
            conn.execute(
                "INSERT INTO refresh_tokens (jti, user_id, expires_at, revoked, created_at) VALUES (?, ?, ?, 0, ?)",
                (jti, user_id, expires_at, _now()),
            )

    def get_refresh_token(self, jti: str) -> dict[str, Any] | None:
        with self.connection() as conn:
            row = conn.execute("SELECT * FROM refresh_tokens WHERE jti = ?", (jti,)).fetchone()
        return dict(row) if row else None

    def revoke_refresh_token(self, jti: str) -> None:
        with self.connection() as conn:
            conn.execute("UPDATE refresh_tokens SET revoked = 1 WHERE jti = ?", (jti,))

    def revoke_all_refresh_tokens(self, user_id: str) -> None:
        with self.connection() as conn:
            conn.execute("UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?", (user_id,))

    def purge_expired_refresh_tokens(self) -> None:
        with self.connection() as conn:
            conn.execute(
                "DELETE FROM refresh_tokens WHERE expires_at < ?",
                (_now(),),
            )

    # ------------------------------------------------------------------
    @staticmethod
    def _row_to_user(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "user_id": row["user_id"],
            "email": row["email"],
            "hashed_password": row["hashed_password"],
            "full_name": row["full_name"],
            "role": row["role"],
            "locale": row["locale"],
            "is_active": bool(row["is_active"]),
            "consent_accepted_at": row.get("consent_accepted_at"),
            "consent_policy_version": row.get("consent_policy_version"),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }


class AuditLogRepository:
    """Append-only audit trail for sensitive account/data events (LGPD Art. 37).

    Entries never contain personal data values, secrets, or tokens -- only
    user_id references, event codes, and safe metadata -- following the same
    redaction policy as docs/standards/secret-handling.md.
    """

    SAFE_EVENT_CODES = {
        "user_registered",
        "user_login",
        "user_login_failed",
        "user_logout",
        "user_password_changed",
        "user_consent_recorded",
        "user_data_exported",
        "user_account_deleted",
        "token_refreshed",
        # Meta-Factory quality gate / auto-repair / release events.
        "quality_gate_run",
        "quality_gate_failed",
        "auto_repair_started",
        "auto_repair_action_applied",
        "auto_repair_failed",
        "auto_repair_completed",
        "revalidation_run",
        "force_release_requested",
        "force_release_confirmed",
        "git_export_blocked",
        # Modernize codebase pipeline events.
        "modernize_project_uploaded",
        "modernize_git_imported",
        "llm_provider_selected",
        "llm_connection_tested",
        "codebase_analysis_started",
        "codebase_analysis_completed",
        "modernization_plan_approved",
        "auto_refactor_started",
        "auto_refactor_completed",
        "revalidation_started",
        "revalidation_completed",
        "modernized_project_exported",
        "LLM_PROVIDER_CONFIGURED",
        "LLM_PROVIDER_SELECTED",
        "LLM_PROVIDER_CONFIRMED",
        "LLM_PROVIDER_TESTED",
        "LLM_PROVIDER_FAILED",
        "LLM_FALLBACK_DETERMINISTIC_USED",
        "LLM_ACTION_STARTED",
        "LLM_ACTION_COMPLETED",
    }

    def __init__(self, sqlite_path: Path | None = None) -> None:
        self.sqlite_path = sqlite_path or get_settings().sqlite_path

    @contextmanager
    def connection(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.sqlite_path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def initialize(self) -> None:
        with self.connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    event_code TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)")
        self.purge_expired()

    def record(self, *, user_id: str | None, event_code: str) -> None:
        if event_code not in self.SAFE_EVENT_CODES:
            event_code = "unknown_event"
        with self.connection() as conn:
            conn.execute(
                "INSERT INTO audit_logs (id, user_id, event_code, created_at) VALUES (?, ?, ?, ?)",
                (f"audit_{uuid4().hex[:12]}", user_id, event_code, _now()),
            )

    def list_for_user(self, user_id: str) -> Sequence[dict[str, Any]]:
        with self.connection() as conn:
            rows = conn.execute(
                "SELECT id, event_code, created_at FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def purge_expired(self) -> None:
        cutoff = datetime.now(timezone.utc) - timedelta(
            days=get_settings().audit_log_retention_days
        )
        with self.connection() as conn:
            conn.execute(
                "DELETE FROM audit_logs WHERE created_at < ?",
                (cutoff.replace(microsecond=0).isoformat(),),
            )

