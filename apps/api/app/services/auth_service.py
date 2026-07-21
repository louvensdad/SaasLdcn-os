from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import urlencode

import httpx
import pyotp
from fastapi import HTTPException, status

from app.core.config import get_settings
from app.core.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    decrypt_secret,
    encrypt_secret,
    hash_password,
    mask_ip,
    verify_password,
)
from app.repositories.user_repository import AuditLogRepository, UserRepository
from app.repositories.tenant_repository import TenantRepository
from app.repositories.billing_repository import BillingRepository
from app.services.billing_service import BillingService
from app.schemas.auth import (
    ActivityExportResponse,
    AuthResponse,
    ConsentRequest,
    PasswordChangeRequest,
    SessionResponse,
    TokenResponse,
    TwoFactorEnrollResponse,
    UserLoginRequest,
    UserPublic,
    UserRegisterRequest,
    UserUpdateRequest,
)

_TOTP_ISSUER = "LDCN OS"

OAuthProvider = Literal["google", "github"]


class OAuthError(Exception):
    """Raised when an OAuth login attempt cannot be completed."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class OAuthNotConfiguredError(OAuthError):
    """Raised when a provider's client id/secret is not set on this server."""


# Static per-provider endpoints. Client id/secret come from Settings (per
# environment); everything else about the exchange is fixed by the provider.
_OAUTH_PROVIDER_SPEC: dict[OAuthProvider, dict[str, str]] = {
    "google": {
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "userinfo_url": "https://www.googleapis.com/oauth2/v3/userinfo",
        "scope": "openid email profile",
    },
    "github": {
        "authorize_url": "https://github.com/login/oauth/authorize",
        "token_url": "https://github.com/login/oauth/access_token",
        "userinfo_url": "https://api.github.com/user",
        "scope": "read:user user:email",
    },
}


def _oauth_credentials(provider: OAuthProvider) -> tuple[str, str]:
    settings = get_settings()
    if provider == "google":
        client_id, client_secret = settings.google_client_id, settings.google_client_secret
    else:
        client_id, client_secret = settings.github_client_id, settings.github_client_secret
    if not client_id or not client_secret:
        raise OAuthNotConfiguredError(f"{provider} OAuth is not configured on this server.")
    return client_id, client_secret


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class AuthService:
    def __init__(
        self,
        user_repository: UserRepository | None = None,
        audit_repository: AuditLogRepository | None = None,
    ) -> None:
        self.user_repository = user_repository or UserRepository()
        self.audit_repository = audit_repository or AuditLogRepository()


    # ------------------------------------------------------------------
    # Registration / login / tokens
    # ------------------------------------------------------------------
    def register(
        self, payload: UserRegisterRequest, *, ip_address: str | None = None, device_label: str | None = None
    ) -> tuple[AuthResponse, str]:
        if not payload.privacy_policy_accepted:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Privacy policy acceptance is required to create an account.",
            )
        if self.user_repository.get_by_email(payload.email) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists.",
            )
        hashed = hash_password(payload.password)
        user = self.user_repository.create_user(
            email=payload.email,
            hashed_password=hashed,
            full_name=payload.full_name,
            locale=payload.locale,
        )
        user = self.user_repository.record_consent(
            user["user_id"],
            get_settings().privacy_policy_version,
        )
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Unable to record privacy policy acceptance.",
            )
        TenantRepository(self.user_repository.database_url).ensure_personal_workspace(
            user["user_id"],
            user["full_name"],
        )
        BillingService(BillingRepository(self.user_repository.database_url)).start_trial(user["user_id"])
        self.audit_repository.record(user_id=user["user_id"], event_code="user_registered")
        self.audit_repository.record(user_id=user["user_id"], event_code="user_consent_recorded")
        return self._issue_tokens(user, ip_address=ip_address, device_label=device_label)

    def login(
        self, payload: UserLoginRequest, *, ip_address: str | None = None, device_label: str | None = None
    ) -> tuple[AuthResponse, str]:
        user = self.user_repository.get_by_email(payload.email)
        # OAuth-only accounts have hashed_password=None: reject rather than pass
        # None into verify_password, which expects a string hash.
        if (
            user is None
            or not user["is_active"]
            or not user["hashed_password"]
            or not verify_password(payload.password, user["hashed_password"])
        ):
            self.audit_repository.record(
                user_id=user["user_id"] if user else None,
                event_code="user_login_failed",
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
            )
        self.audit_repository.record(user_id=user["user_id"], event_code="user_login")
        return self._issue_tokens(user, ip_address=ip_address, device_label=device_label)

    def refresh(
        self, refresh_token: str, *, ip_address: str | None = None, device_label: str | None = None
    ) -> tuple[AuthResponse, str]:
        try:
            payload = decode_token(refresh_token, expected_type="refresh")
        except TokenError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=exc.message) from exc

        stored = self.user_repository.get_refresh_token(payload["jti"])
        if stored is None or stored["revoked"]:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token has been revoked.")

        user = self.user_repository.get_by_id(payload["sub"])
        if user is None or not user["is_active"]:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive.")

        # Rotate the refresh token: revoke the one just used and issue a fresh pair.
        self.user_repository.revoke_refresh_token(payload["jti"])
        self.audit_repository.record(user_id=user["user_id"], event_code="token_refreshed")
        return self._issue_tokens(
            user, ip_address=ip_address, device_label=device_label, rotate_from_jti=payload["jti"]
        )

    def logout(self, user_id: str, refresh_token: str | None) -> None:
        if refresh_token:
            try:
                payload = decode_token(refresh_token, expected_type="refresh")
                self.user_repository.revoke_refresh_token(payload["jti"])
                self.user_repository.revoke_session_by_jti(payload["jti"])
            except TokenError:
                pass
        self.audit_repository.record(user_id=user_id, event_code="user_logout")

    # ------------------------------------------------------------------
    # OAuth (Google / GitHub)
    # ------------------------------------------------------------------
    def oauth_authorize_url(self, provider: OAuthProvider, redirect_uri: str) -> tuple[str, str]:
        """Build the provider's consent-screen URL plus a fresh CSRF state token.

        The caller is responsible for round-tripping `state` (e.g. a short-lived
        cookie) and checking it matches on callback.
        """
        client_id, _ = _oauth_credentials(provider)
        spec = _OAUTH_PROVIDER_SPEC[provider]
        state = secrets.token_urlsafe(24)
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": spec["scope"],
            "state": state,
        }
        if provider == "google":
            params["response_type"] = "code"
            params["access_type"] = "online"
            params["prompt"] = "select_account"
        return f"{spec['authorize_url']}?{urlencode(params)}", state

    def oauth_callback(
        self,
        provider: OAuthProvider,
        *,
        code: str,
        redirect_uri: str,
        ip_address: str | None = None,
        device_label: str | None = None,
    ) -> tuple[AuthResponse, str]:
        """Exchange an authorization code for the caller's identity and issue our
        own session tokens, linking to an existing account by email or creating
        a new OAuth-only account (per the user's decision: auto-link by email,
        since both providers only hand us a verified email)."""
        client_id, client_secret = _oauth_credentials(provider)
        spec = _OAUTH_PROVIDER_SPEC[provider]
        try:
            with httpx.Client(timeout=10.0) as client:
                token_response = client.post(
                    spec["token_url"],
                    data={
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "code": code,
                        "redirect_uri": redirect_uri,
                        "grant_type": "authorization_code",
                    },
                    headers={"Accept": "application/json"},
                )
                token_response.raise_for_status()
                access_token = token_response.json().get("access_token")
                if not access_token:
                    raise OAuthError("Provider did not return an access token.")

                if provider == "google":
                    subject, email, email_verified, full_name = self._google_identity(client, access_token)
                else:
                    subject, email, email_verified, full_name = self._github_identity(client, access_token)
        except httpx.HTTPError as exc:
            raise OAuthError("Unable to reach the OAuth provider.") from exc

        if not subject:
            raise OAuthError("Provider did not return a stable user identifier.")
        if not email or not email_verified:
            raise OAuthError("Provider account has no verified email address.")

        user = self.user_repository.get_by_oauth(provider, subject)
        if user is None:
            existing = self.user_repository.get_by_email(email)
            if existing is not None:
                user = self.user_repository.link_oauth(existing["user_id"], provider, subject)
            else:
                user = self.user_repository.create_oauth_user(
                    email=email,
                    full_name=full_name,
                    locale="pt-BR",
                    oauth_provider=provider,
                    oauth_subject=subject,
                )
                # No consent checkbox exists in the OAuth flow: starting a social
                # login is treated as accepting the privacy policy, same as the
                # implicit acceptance a password-based register() records.
                user = self.user_repository.record_consent(user["user_id"], get_settings().privacy_policy_version)
                TenantRepository(self.user_repository.database_url).ensure_personal_workspace(
                    user["user_id"], user["full_name"],
                )
                self.audit_repository.record(user_id=user["user_id"], event_code="user_registered")

        if user is None or not user["is_active"]:
            raise OAuthError("This account is not available for sign-in.")

        self.audit_repository.record(user_id=user["user_id"], event_code="user_login")
        return self._issue_tokens(user, ip_address=ip_address, device_label=device_label)

    @staticmethod
    def _google_identity(client: httpx.Client, access_token: str) -> tuple[str | None, str | None, bool, str]:
        response = client.get(
            _OAUTH_PROVIDER_SPEC["google"]["userinfo_url"],
            headers={"Authorization": f"Bearer {access_token}"},
        )
        response.raise_for_status()
        info = response.json()
        email = info.get("email")
        full_name = info.get("name") or (email.split("@")[0] if email else "User")
        return info.get("sub"), email, bool(info.get("email_verified", False)), full_name

    @staticmethod
    def _github_identity(client: httpx.Client, access_token: str) -> tuple[str | None, str | None, bool, str]:
        headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"}
        user_response = client.get(_OAUTH_PROVIDER_SPEC["github"]["userinfo_url"], headers=headers)
        user_response.raise_for_status()
        info = user_response.json()
        subject = str(info["id"]) if info.get("id") is not None else None
        full_name = info.get("name") or info.get("login") or "User"

        email = info.get("email")
        email_verified = bool(email)
        if not email:
            # GitHub omits `email` from /user when the user's email is private;
            # the verified primary address is only on /user/emails.
            emails_response = client.get("https://api.github.com/user/emails", headers=headers)
            emails_response.raise_for_status()
            primary = next(
                (entry for entry in emails_response.json() if entry.get("primary") and entry.get("verified")),
                None,
            )
            if primary:
                email = primary["email"]
                email_verified = True
        return subject, email, email_verified, full_name

    # ------------------------------------------------------------------
    # Profile
    # ------------------------------------------------------------------
    def get_profile(self, user: dict) -> UserPublic:
        return UserPublic.model_validate(user)

    def update_profile(self, user_id: str, payload: UserUpdateRequest) -> UserPublic:
        updated = self.user_repository.update_profile(user_id, full_name=payload.full_name, locale=payload.locale)
        if updated is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
        return UserPublic.model_validate(updated)

    def change_password(self, user_id: str, payload: PasswordChangeRequest) -> None:
        current_hash = self.user_repository.get_hashed_password(user_id)
        if current_hash is None or not verify_password(payload.current_password, current_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect.")
        self.user_repository.set_password(user_id, hash_password(payload.new_password))
        # Changing the password invalidates every existing session.
        self.user_repository.revoke_all_refresh_tokens(user_id)
        self.user_repository.revoke_all_sessions(user_id)
        self.audit_repository.record(user_id=user_id, event_code="user_password_changed")

    # ------------------------------------------------------------------
    # LGPD: consent, data export, account deletion
    # ------------------------------------------------------------------
    def record_consent(self, user_id: str, payload: ConsentRequest) -> UserPublic:
        if not payload.accepted:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Consent must be accepted to continue using the platform.",
            )
        if payload.policy_version != get_settings().privacy_policy_version:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The submitted privacy policy version is not current.",
            )
        updated = self.user_repository.record_consent(user_id, payload.policy_version)
        if updated is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
        self.audit_repository.record(user_id=user_id, event_code="user_consent_recorded")
        return UserPublic.model_validate(updated)

    def export_data(self, user: dict) -> dict:
        """LGPD Art. 15-18: export all personal data held about the requesting user."""
        self.audit_repository.record(user_id=user["user_id"], event_code="user_data_exported")
        return {
            "contractVersion": "1.0.0",
            "exported_at": _now_iso(),
            "user": UserPublic.model_validate(user).model_dump(),
            # Projects generated in LDCN OS are workspace-level build artifacts and
            # are not tied to an individual account in this version, so they are
            # intentionally excluded from the personal-data export.
            "projects": [],
            "audit_events": list(self.audit_repository.list_for_user(user["user_id"])),
        }

    def delete_account(self, user_id: str) -> dict:
        """LGPD Art. 18 (right to erasure): anonymize the account and revoke sessions."""
        deleted = self.user_repository.anonymize_user(user_id)
        if not deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
        self.audit_repository.record(user_id=user_id, event_code="user_account_deleted")
        return {
            "message": "Account deleted. Your personal data has been anonymized.",
            "deleted_at": _now_iso(),
        }

    def deactivate_account(self, user_id: str) -> dict:
        """Reversible-in-spirit: flips is_active off (which blocks login and every
        authenticated route) and revokes all sessions/tokens. Distinct from
        delete_account, which anonymizes irreversibly."""
        deactivated = self.user_repository.deactivate(user_id)
        if not deactivated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
        self.audit_repository.record(user_id=user_id, event_code="user_account_deactivated")
        return {"message": "Account deactivated.", "deactivated_at": _now_iso()}

    def logout_everywhere(self, user_id: str) -> None:
        """Danger-zone "sign out of all devices": revoke every refresh token and
        session for the user, not just the one that made the request."""
        self.user_repository.revoke_all_refresh_tokens(user_id)
        self.user_repository.revoke_all_sessions(user_id)
        self.audit_repository.record(user_id=user_id, event_code="user_logout")

    # ------------------------------------------------------------------
    # Profile avatar
    # ------------------------------------------------------------------
    def get_avatar(self, user_id: str) -> str | None:
        return self.user_repository.get_avatar(user_id)

    def set_avatar(self, user_id: str, avatar_url: str | None) -> str | None:
        updated = self.user_repository.set_avatar(user_id, avatar_url)
        if not updated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
        self.audit_repository.record(
            user_id=user_id,
            event_code="user_avatar_updated" if avatar_url else "user_avatar_removed",
        )
        return avatar_url

    # ------------------------------------------------------------------
    def _issue_tokens(
        self,
        user: dict,
        *,
        ip_address: str | None = None,
        device_label: str | None = None,
        rotate_from_jti: str | None = None,
    ) -> tuple[AuthResponse, str]:
        settings = get_settings()
        access_token, _ = create_access_token(user["user_id"], user["role"])
        refresh_token, jti, expires_at = create_refresh_token(user["user_id"], user["role"])
        self.user_repository.store_refresh_token(
            jti=jti,
            user_id=user["user_id"],
            expires_at=expires_at.isoformat(),
        )
        rotated = None
        if rotate_from_jti:
            rotated = self.user_repository.rotate_session(
                old_jti=rotate_from_jti, new_jti=jti, ip_address=ip_address, device_label=device_label
            )
        if rotated is None:
            self.user_repository.create_session(
                user_id=user["user_id"], refresh_token_jti=jti, ip_address=ip_address, device_label=device_label
            )
        tokens = TokenResponse(
            access_token=access_token,
            expires_in=settings.access_token_expire_minutes * 60,
        )
        response = AuthResponse(user=UserPublic.model_validate(user), tokens=tokens)
        return response, refresh_token

    # ------------------------------------------------------------------
    # Login sessions
    # ------------------------------------------------------------------
    def list_sessions(self, user: dict, *, current_jti: str | None) -> list[SessionResponse]:
        sessions = self.user_repository.list_sessions(user["user_id"])
        return [
            SessionResponse(
                session_id=item["session_id"],
                ip_address=mask_ip(item["ip_address"]) if item["ip_address"] else None,
                device_label=item["device_label"],
                created_at=item["created_at"],
                last_seen_at=item["last_seen_at"],
                is_current=bool(current_jti) and item["refresh_token_jti"] == current_jti,
            )
            for item in sessions
        ]

    def revoke_session(self, user_id: str, session_id: str) -> None:
        jti = self.user_repository.revoke_session(session_id, user_id)
        if jti is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
        self.user_repository.revoke_refresh_token(jti)
        self.audit_repository.record(user_id=user_id, event_code="user_session_revoked")

    def revoke_other_sessions(self, user_id: str, *, current_jti: str | None) -> None:
        revoked_jtis = self.user_repository.revoke_other_sessions(user_id, current_jti)
        for jti in revoked_jtis:
            self.user_repository.revoke_refresh_token(jti)
        self.audit_repository.record(user_id=user_id, event_code="user_sessions_revoked_all")

    # ------------------------------------------------------------------
    # Two-factor authentication (TOTP)
    # ------------------------------------------------------------------
    def enroll_2fa(self, user: dict) -> TwoFactorEnrollResponse:
        if user["is_2fa_enabled"]:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Two-factor authentication is already enabled. Disable it before re-enrolling.",
            )
        secret = pyotp.random_base32()
        self.user_repository.set_pending_totp_secret(user["user_id"], encrypt_secret(secret))
        otpauth_uri = pyotp.totp.TOTP(secret).provisioning_uri(name=user["email"], issuer_name=_TOTP_ISSUER)
        return TwoFactorEnrollResponse(secret=secret, otpauth_uri=otpauth_uri)

    def verify_2fa(self, user: dict, code: str) -> UserPublic:
        encrypted = self.user_repository.get_totp_secret_encrypted(user["user_id"])
        if not encrypted:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Start enrollment first via POST /auth/me/2fa/enroll.",
            )
        if not pyotp.TOTP(decrypt_secret(encrypted)).verify(code, valid_window=1):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid verification code.")
        self.user_repository.enable_2fa(user["user_id"])
        self.audit_repository.record(user_id=user["user_id"], event_code="user_2fa_enabled")
        updated = self.user_repository.get_by_id(user["user_id"])
        return UserPublic.model_validate(updated)

    def disable_2fa(self, user: dict, code: str) -> UserPublic:
        if not user["is_2fa_enabled"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Two-factor authentication is not enabled.")
        encrypted = self.user_repository.get_totp_secret_encrypted(user["user_id"])
        if not encrypted or not pyotp.TOTP(decrypt_secret(encrypted)).verify(code, valid_window=1):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid verification code.")
        self.user_repository.disable_2fa(user["user_id"])
        self.audit_repository.record(user_id=user["user_id"], event_code="user_2fa_disabled")
        updated = self.user_repository.get_by_id(user["user_id"])
        return UserPublic.model_validate(updated)

    # ------------------------------------------------------------------
    # Consent revocation + activity export
    # ------------------------------------------------------------------
    def revoke_consent(self, user_id: str) -> UserPublic:
        updated = self.user_repository.revoke_consent(user_id)
        if updated is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
        self.audit_repository.record(user_id=user_id, event_code="user_consent_revoked")
        return UserPublic.model_validate(updated)

    def export_activity(self, user: dict) -> ActivityExportResponse:
        self.audit_repository.record(user_id=user["user_id"], event_code="user_activity_exported")
        return ActivityExportResponse(
            contractVersion="1.0.0",
            exported_at=_now_iso(),
            user_id=user["user_id"],
            activity=list(self.audit_repository.list_for_user(user["user_id"])),
        )
