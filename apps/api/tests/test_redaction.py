from __future__ import annotations

from app.repositories.redaction import REDACTED, redact_text, redact_value


def test_redacts_bearer_token():
    out = redact_text("401 Unauthorized — Authorization: Bearer sk-ant-api03-abcdefghijklmnop123456")
    assert "sk-ant-api03" not in out
    assert REDACTED in out


def test_redacts_provider_key_in_url_or_kv():
    assert "sk-proj" not in redact_text("connect failed api_key=sk-proj-ABCDEF1234567890LONGENOUGH")
    assert "sk-live" not in redact_text("boom sk-live-ABCDEFGHIJKLMNOPQRSTUVWX exceeded")


def test_leaves_clean_error_untouched():
    msg = "TimeoutError: provider did not respond within 360s"
    assert redact_text(msg) == msg


def test_redact_value_masks_sensitive_dict_keys_and_inline():
    out = redact_value({"api_key": "supersecret", "note": "token: sk-ant-api03-abcdefghijklmnop123456"})
    assert out["api_key"] == REDACTED
    assert "sk-ant-api03" not in out["note"]
