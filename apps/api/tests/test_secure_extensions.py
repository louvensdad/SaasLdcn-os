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


def test_user_key_boost_placeholder_endpoints_return_501(client):
    assert_placeholder(client.get("/api/user-ai-keys/status"))
    assert_placeholder(client.post("/api/user-ai-keys/session", json={"api_key": "should-not-be-processed"}))
    assert_placeholder(client.delete("/api/user-ai-keys/session"))


def test_user_key_boost_placeholder_does_not_echo_api_key(client):
    response = client.post("/api/user-ai-keys/session", json={"api_key": "sk-secret-value-that-must-not-return"})

    assert_placeholder(response)
    assert "sk-secret-value-that-must-not-return" not in response.text
    assert "api_key" not in response.text


def test_git_export_placeholder_endpoints_return_501(client):
    assert_placeholder(client.post("/api/git/export/github", json={"token": "ghp-secret-value-that-must-not-return"}))
    assert_placeholder(client.post("/api/git/export/gitlab", json={"token": "glpat-secret-value-that-must-not-return"}))
    assert_placeholder(client.get("/api/git/export/status/export-123"))
    assert "ghp-secret-value-that-must-not-return" not in client.post(
        "/api/git/export/github",
        json={"token": "ghp-secret-value-that-must-not-return"},
    ).text


def test_pdf_contract_placeholder_endpoints_return_501(client):
    assert_placeholder(client.post("/api/contracts/upload-pdf", files={"file": ("contract.pdf", b"%PDF-test")}))
    assert_placeholder(client.post("/api/contracts/analyze", json={"contract_id": "contract-123"}))
    assert_placeholder(client.get("/api/contracts/contract-123/report"))


def test_roadmap_marks_secure_extensions_planned(client):
    response = client.get("/api/roadmap")

    assert response.status_code == 200
    items = {item["id"]: item for item in response.json()["items"]}
    for extension_id in ("user_key_boost", "git_export", "pdf_contract_input"):
        assert items[extension_id]["category"] == "extension"
        assert items[extension_id]["status"] == "PLANNED"


def test_system_status_marks_secure_extensions_inactive_planned(client):
    response = client.get("/api/system-status")

    assert response.status_code == 200
    extensions = {item["id"]: item for item in response.json()["planned_extensions"]}
    for extension_id in ("user_key_boost", "git_export", "pdf_contract_input"):
        assert extensions[extension_id]["status"] == "inactive"
        assert extensions[extension_id]["lifecycle"] == "planned"
