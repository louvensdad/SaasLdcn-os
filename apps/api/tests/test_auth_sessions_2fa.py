from __future__ import annotations

import pyotp


def test_registration_creates_a_visible_current_session(client):
    response = client.get("/api/auth/me/sessions")

    assert response.status_code == 200
    sessions = response.json()
    assert len(sessions) == 1
    assert sessions[0]["is_current"] is True
    assert sessions[0]["created_at"]
    assert sessions[0]["last_seen_at"]
    # IP is masked for display, never the raw client host verbatim.
    assert "***" in (sessions[0]["ip_address"] or "***")


def test_revoking_a_session_also_revokes_its_refresh_token(client):
    session_id = client.get("/api/auth/me/sessions").json()[0]["session_id"]

    revoke = client.delete(f"/api/auth/me/sessions/{session_id}")
    assert revoke.status_code == 204

    # The cookie jar still carries the now-revoked refresh token.
    refresh = client.post("/api/auth/refresh")
    assert refresh.status_code == 401


def test_revoking_an_unknown_session_is_404(client):
    response = client.delete("/api/auth/me/sessions/session_does_not_exist")
    assert response.status_code == 404


def test_revoke_other_sessions_keeps_only_the_current_one(client):
    # A second login for the same account (same cookie jar) creates a second
    # session row and moves the "current" cookie to that new session.
    me = client.get("/api/auth/me").json()
    login = client.post(
        "/api/auth/login",
        json={"email": me["email"], "password": "TestPassword123!"},
    )
    assert login.status_code == 200
    assert len(client.get("/api/auth/me/sessions").json()) == 2

    revoke_others = client.delete("/api/auth/me/sessions")
    assert revoke_others.status_code == 204

    remaining = client.get("/api/auth/me/sessions").json()
    assert len(remaining) == 1
    assert remaining[0]["is_current"] is True


def test_revoke_other_sessions_without_a_current_cookie_revokes_all(client):
    # A second login creates a second session, then dropping the refresh cookie
    # means no session can be flagged "current" -> revoke-others revokes every one.
    me = client.get("/api/auth/me").json()
    client.post("/api/auth/login", json={"email": me["email"], "password": "TestPassword123!"})
    assert len(client.get("/api/auth/me/sessions").json()) == 2

    client.cookies.clear()
    revoke = client.delete("/api/auth/me/sessions")
    assert revoke.status_code == 204
    assert client.get("/api/auth/me/sessions").json() == []


def test_2fa_enroll_verify_disable_round_trip(client):
    enroll = client.post("/api/auth/me/2fa/enroll")
    assert enroll.status_code == 200
    secret = enroll.json()["secret"]
    assert enroll.json()["otpauth_uri"].startswith("otpauth://totp/")

    wrong_code = client.post("/api/auth/me/2fa/verify", json={"code": "000000"})
    assert wrong_code.status_code == 401
    assert client.get("/api/auth/me").json()["is_2fa_enabled"] is False

    valid_code = pyotp.TOTP(secret).now()
    verify = client.post("/api/auth/me/2fa/verify", json={"code": valid_code})
    assert verify.status_code == 200
    assert verify.json()["is_2fa_enabled"] is True
    assert client.get("/api/auth/me").json()["is_2fa_enabled"] is True

    # Re-enrolling while already enabled is rejected.
    assert client.post("/api/auth/me/2fa/enroll").status_code == 409

    disable_wrong = client.post("/api/auth/me/2fa/disable", json={"code": "000000"})
    assert disable_wrong.status_code == 401

    disable = client.post("/api/auth/me/2fa/disable", json={"code": pyotp.TOTP(secret).now()})
    assert disable.status_code == 200
    assert disable.json()["is_2fa_enabled"] is False


def test_2fa_disable_without_enrollment_is_rejected(client):
    response = client.post("/api/auth/me/2fa/disable", json={"code": "123456"})
    assert response.status_code == 400


def test_2fa_secret_never_leaks_in_any_response_text(client):
    enroll = client.post("/api/auth/me/2fa/enroll")
    secret = enroll.json()["secret"]
    pyotp.TOTP(secret).now()

    me = client.get("/api/auth/me")
    export = client.get("/api/auth/me/export")
    activity = client.get("/api/auth/me/activity-export")
    sessions = client.get("/api/auth/me/sessions")

    for response in (me, export, activity, sessions):
        assert secret not in response.text
        assert "totp_secret" not in response.text


def test_consent_revoke_clears_acceptance_timestamp(client):
    before = client.get("/api/auth/me").json()
    assert before["consent_accepted_at"]

    revoke = client.post("/api/auth/me/consent/revoke")
    assert revoke.status_code == 200
    assert revoke.json()["consent_accepted_at"] is None
    assert client.get("/api/auth/me").json()["consent_accepted_at"] is None


_TINY_PNG = (
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nG"
    "NgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC"
)


def test_avatar_upload_get_and_clear_round_trip(client):
    assert client.get("/api/auth/me/avatar").json()["avatar_url"] is None

    upload = client.put("/api/auth/me/avatar", json={"avatar_url": _TINY_PNG})
    assert upload.status_code == 200
    assert upload.json()["avatar_url"] == _TINY_PNG
    assert client.get("/api/auth/me/avatar").json()["avatar_url"] == _TINY_PNG

    cleared = client.put("/api/auth/me/avatar", json={"avatar_url": None})
    assert cleared.status_code == 200
    assert cleared.json()["avatar_url"] is None


def test_avatar_rejects_non_image_and_oversized_payloads(client):
    not_image = client.put("/api/auth/me/avatar", json={"avatar_url": "data:text/html;base64,PHNjcmlwdD4="})
    assert not_image.status_code == 422

    oversized = client.put("/api/auth/me/avatar", json={"avatar_url": "data:image/png;base64," + "A" * 400_001})
    assert oversized.status_code == 422


def test_avatar_is_not_leaked_in_user_or_export_responses(client):
    client.put("/api/auth/me/avatar", json={"avatar_url": _TINY_PNG})
    # Kept out of UserPublic on purpose so it doesn't ride along on every auth call.
    assert "avatar_url" not in client.get("/api/auth/me").text
    assert "avatar_url" not in client.get("/api/auth/me/export").text


def test_deactivate_account_blocks_further_access(client):
    response = client.post("/api/auth/me/deactivate")
    assert response.status_code == 200
    assert "deactivated_at" in response.json()
    # is_active=False now blocks every authenticated route and refresh.
    assert client.get("/api/auth/me").status_code == 401
    assert client.post("/api/auth/refresh").status_code == 401


def test_logout_all_devices_revokes_every_session(client):
    me = client.get("/api/auth/me").json()
    client.post("/api/auth/login", json={"email": me["email"], "password": "TestPassword123!"})
    assert len(client.get("/api/auth/me/sessions").json()) == 2

    logout_all = client.post("/api/auth/me/logout-all")
    assert logout_all.status_code == 204
    # Every refresh token is revoked, so the carried cookie can no longer refresh.
    assert client.post("/api/auth/refresh").status_code == 401


def test_activity_export_lists_safe_audit_events(client):
    response = client.get("/api/auth/me/activity-export")

    assert response.status_code == 200
    payload = response.json()
    assert payload["contractVersion"]
    assert payload["user_id"]
    assert payload["activity"]
    assert all("event_code" in event for event in payload["activity"])
    assert any(event["event_code"] == "user_activity_exported" for event in payload["activity"])
    assert "password" not in response.text.lower()
