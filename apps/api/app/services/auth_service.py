from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status

from app.core.config import get_settings
from app.core.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.repositories.user_repository import AuditLogRepository, UserRepository
from app.schemas.auth import (
    AuthResponse,
    ConsentRequest,
    PasswordChangeRequest,
    TokenResponse,
    UserLoginRequest,
    UserPublic,
    UserRegisterRequest,
    UserUpdateRequest,
)


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
    def register(self, payload: UserRegisterRequest) -> tuple[AuthResponse, str]:
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
        self.audit_repository.record(user_id=user["user_id"], event_code="user_registered")
        self.audit_repository.record(user_id=user["user_id"], event_code="user_consent_recorded")
        return self._issue_tokens(user)

    def login(self, payload: UserLoginRequest) -> tuple[AuthResponse, str]:
        user = self.user_repository.get_by_email(payload.email)
        if user is None or not user["is_active"] or not verify_password(payload.password, user["hashed_password"]):
            self.audit_repository.record(
                user_id=user["user_id"] if user else None,
                event_code="user_login_failed",
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
            )
        self.audit_repository.record(user_id=user["user_id"], event_code="user_login")
        return self._issue_tokens(user)

    def refresh(self, refresh_token: str) -> tuple[AuthResponse, str]:
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
        return self._issue_tokens(user)

    def logout(self, user_id: str, refresh_token: str | None) -> None:
        if refresh_token:
            try:
                payload = decode_token(refresh_token, expected_type="refresh")
                self.user_repository.revoke_refresh_token(payload["jti"])
            except TokenError:
                pass
        self.audit_repository.record(user_id=user_id, event_code="user_logout")

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

    # ------------------------------------------------------------------
    def _issue_tokens(self, user: dict) -> tuple[AuthResponse, str]:
        settings = get_settings()
        access_token, _ = create_access_token(user["user_id"], user["role"])
        refresh_token, jti, expires_at = create_refresh_token(user["user_id"], user["role"])
        self.user_repository.store_refresh_token(
            jti=jti,
            user_id=user["user_id"],
            expires_at=expires_at.isoformat(),
        )
        tokens = TokenResponse(
            access_token=access_token,
            expires_in=settings.access_token_expire_minutes * 60,
        )
        response = AuthResponse(user=UserPublic.model_validate(user), tokens=tokens)
        return response, refresh_token
