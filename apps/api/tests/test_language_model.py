from __future__ import annotations


def test_glossary_exposes_canonical_vault_terms(client):
    response = client.get("/api/language-model/glossary")
    assert response.status_code == 200
    terms = {item["term"] for item in response.json()}
    assert {"PromptMaster.md", "Blueprint", "Skill", "Meta-Factory"} <= terms


def test_legacy_agent_alias_resolves_to_skill(client):
    response = client.post("/api/language-model/resolve", json={"term": "Agent"})
    assert response.status_code == 200
    assert response.json()["term"] == "Skill"
    assert response.json()["is_alias"] is True


def test_term_resolution_is_case_and_accent_insensitive(client):
    response = client.post("/api/language-model/resolve", json={"term": "memoria"})
    assert response.status_code == 200
    assert response.json()["term"] == "Memória"
    assert response.json()["is_alias"] is False


def test_validation_reports_unknown_terms_and_legacy_aliases(client):
    response = client.post("/api/language-model/validate", json={"terms": ["Blueprint", "Meta Engine", "Widget mágico"]})
    assert response.status_code == 200
    assert response.json() == {
        "valid": False,
        "unknown_terms": ["Widget mágico"],
        "legacy_aliases": [{"alias": "Meta Engine", "canonical_term": "Meta-Factory"}],
    }


def test_unknown_term_returns_stable_error_code(client):
    response = client.post("/api/language-model/resolve", json={"term": "UnknownThing"})
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "GLOSSARY_TERM_NOT_FOUND"
