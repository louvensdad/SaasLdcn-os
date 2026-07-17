from app.services.activity_feed_service import sanitize_metadata


def test_activity_metadata_redacts_secrets_and_prompts():
    value = sanitize_metadata({
        "provider": "github",
        "api_key": "do-not-store",
        "nested": {"access_token": "also-secret", "prompt": "private prompt"},
        "safe": "visible",
    })
    assert value == {
        "provider": "github",
        "api_key": "[REDACTED]",
        "nested": {"access_token": "[REDACTED]", "prompt": "[REDACTED]"},
        "safe": "visible",
    }


def test_activity_metadata_caps_large_values_and_lists():
    value = sanitize_metadata({"message": "x" * 3000, "items": list(range(100))})
    assert len(value["message"]) == 2001
    assert len(value["items"]) == 50
