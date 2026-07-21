from __future__ import annotations


PLACEHOLDER_MESSAGE = "Feature planned but not active in V1 Foundation."
PLACEHOLDER_PAYLOAD = {
    "status": "planned",
    "active": False,
    "message": PLACEHOLDER_MESSAGE,
    "phase": "future_secure_extension",
}


def assert_placeholder(response):
    assert response.status_code == 501
    assert response.json() == PLACEHOLDER_PAYLOAD


def test_user_key_boost_validation_error_does_not_echo_api_key(client):
    # User Key Boost is implemented (see test_user_ai_keys.py). Here we keep the
    # security invariant: even a validation error (missing provider/nome) must
    # never echo the raw key back in the HTTP response.
    response = client.post(
        "/api/user-ai-keys",
        json={"api_key": "sk-secret-value-that-must-not-return"},
    )

    assert response.status_code == 422
    assert "sk-secret-value-that-must-not-return" not in response.text


def test_git_export_endpoints_validate_requests_without_echoing_tokens(client):
    response = client.post(
        "/api/git/export/github",
        json={"token": "ghp-secret-value-that-must-not-return"},
    )

    assert response.status_code == 422
    assert "ghp-secret-value-that-must-not-return" not in response.text
    assert client.get("/api/git/export/status/export-123").status_code == 404


def test_pdf_contract_placeholder_endpoints_return_501(client):
    assert_placeholder(client.post("/api/contracts/upload-pdf", files={"file": ("contract.pdf", b"%PDF-test")}))
    assert_placeholder(client.post("/api/contracts/analyze", json={"contract_id": "contract-123"}))
    assert_placeholder(client.get("/api/contracts/contract-123/report"))


def test_roadmap_marks_secure_extensions_planned(client):
    response = client.get("/api/roadmap")

    assert response.status_code == 200
    items = {item["id"]: item for item in response.json()["items"]}
    # PDF contract input remains the only planned secure extension.
    assert items["pdf_contract_input"]["category"] == "extension"
    assert items["pdf_contract_input"]["status"] == "PLANNED"
    # Git export and (now) User Key Boost are implemented.
    assert items["git_export"]["status"] == "IMPLEMENTED"
    assert items["user_key_boost"]["status"] == "IMPLEMENTED"


def test_system_status_marks_secure_extensions_inactive_planned(client):
    response = client.get("/api/system-status")

    assert response.status_code == 200
    extensions = {item["id"]: item for item in response.json()["planned_extensions"]}
    assert extensions["pdf_contract_input"]["status"] == "inactive"
    assert extensions["pdf_contract_input"]["lifecycle"] == "planned"
    # Implemented extensions are no longer listed as planned.
    assert "git_export" not in extensions
    assert "user_key_boost" not in extensions
