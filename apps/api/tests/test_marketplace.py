from __future__ import annotations

from uuid import uuid4

import pytest


def _create_automation(client, **overrides):
    body = {"title": "Ping API", "action_config": {"method": "GET", "url": "https://example.com"}}
    body.update(overrides)
    return client.post("/api/automations", json=body).json()


def _publish(client, automation_id, **overrides):
    body = {"source_automation_id": automation_id, "name": "Ping Checker", "description": "Checks a URL.", "license": "MIT"}
    body.update(overrides)
    return client.post("/api/marketplace/items", json=body)


def _other_client_token(client):
    register = client.post(
        "/api/auth/register",
        json={"email": f"other_{uuid4().hex}@example.com", "password": "TestPassword123!", "full_name": "Other", "privacy_policy_accepted": True},
    )
    return register.json()["tokens"]["access_token"]


def test_publish_from_an_owned_automation(client):
    automation = _create_automation(client)
    response = _publish(client, automation["id"])
    assert response.status_code == 201
    item = response.json()
    assert item["status"] == "published"
    assert item["version"] == 1
    assert item["kind"] == "automation_template"
    assert item["permissions"] == ["trigger:manual", "action:http_request"]
    assert item["price_cents"] == 0
    assert item["content"]["action_config"]["url"] == "https://example.com"
    assert len(item["content_hash"]) == 64


@pytest.mark.parametrize(
    "headers",
    [
        {"Authorization": "Bearer literal-production-token"},
        {"X-API-Key": "literal-production-key"},
        {"X-Custom": "api_key=literal-production-key"},
    ],
)
def test_publish_rejects_literal_sensitive_headers(client, headers):
    automation = _create_automation(
        client,
        action_config={"method": "GET", "url": "https://example.com", "headers": headers},
    )
    response = _publish(client, automation["id"])
    assert response.status_code == 422


def test_publish_rejects_an_automation_you_do_not_own(client):
    automation = _create_automation(client)
    other_token = _other_client_token(client)
    response = client.post(
        "/api/marketplace/items",
        json={"source_automation_id": automation["id"], "name": "Steal", "description": "", "license": "MIT"},
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert response.status_code == 404


def test_catalog_only_lists_published_items(client):
    automation = _create_automation(client)
    item = _publish(client, automation["id"]).json()

    catalog = client.get("/api/marketplace/items")
    assert catalog.status_code == 200
    assert any(row["id"] == item["id"] for row in catalog.json())

    archived = client.post(f"/api/marketplace/items/{item['id']}/archive")
    assert archived.json()["status"] == "archived"

    catalog_after = client.get("/api/marketplace/items")
    assert not any(row["id"] == item["id"] for row in catalog_after.json())


def test_catalog_search_matches_name_and_description(client):
    automation = _create_automation(client)
    _publish(client, automation["id"], name="Slack Notifier", description="Pings a Slack webhook.")

    hit = client.get("/api/marketplace/items", params={"search": "slack"})
    assert len(hit.json()) == 1
    miss = client.get("/api/marketplace/items", params={"search": "nothing-matches-this"})
    assert len(miss.json()) == 0


def test_draft_item_only_visible_to_its_author(client):
    automation = _create_automation(client)
    item = _publish(client, automation["id"]).json()
    client.post(f"/api/marketplace/items/{item['id']}/archive")

    other_token = _other_client_token(client)
    response = client.get(f"/api/marketplace/items/{item['id']}", headers={"Authorization": f"Bearer {other_token}"})
    assert response.status_code == 404

    own = client.get(f"/api/marketplace/items/{item['id']}")
    assert own.status_code == 200


def test_install_clones_a_new_owned_automation(client):
    automation = _create_automation(client, action_config={"method": "GET", "url": "https://example.com/ping"})
    item = _publish(client, automation["id"]).json()
    other_token = _other_client_token(client)

    install = client.post(f"/api/marketplace/items/{item['id']}/install", headers={"Authorization": f"Bearer {other_token}"})
    assert install.status_code == 201
    body = install.json()
    assert body["item_id"] == item["id"]
    assert body["item_version"] == 1
    assert body["uninstalled_at"] is None

    cloned = client.get(f"/api/automations/{body['installed_automation_id']}", headers={"Authorization": f"Bearer {other_token}"})
    assert cloned.status_code == 200
    assert cloned.json()["action_config"]["url"] == "https://example.com/ping"
    assert cloned.json()["status"] == "draft"

    original_owner_cannot_see_it = client.get(f"/api/automations/{body['installed_automation_id']}")
    assert original_owner_cannot_see_it.status_code == 404


def test_cannot_install_a_draft_or_archived_item(client):
    automation = _create_automation(client)
    item = _publish(client, automation["id"]).json()
    client.post(f"/api/marketplace/items/{item['id']}/archive")

    response = client.post(f"/api/marketplace/items/{item['id']}/install")
    assert response.status_code == 404


def test_uninstall_archives_the_cloned_automation_and_marks_the_install(client):
    automation = _create_automation(client)
    item = _publish(client, automation["id"]).json()
    other_token = _other_client_token(client)
    headers = {"Authorization": f"Bearer {other_token}"}

    install = client.post(f"/api/marketplace/items/{item['id']}/install", headers=headers).json()
    uninstalled = client.post(f"/api/marketplace/installs/{install['id']}/uninstall", headers=headers)
    assert uninstalled.status_code == 200
    assert uninstalled.json()["uninstalled_at"] is not None

    cloned = client.get(f"/api/automations/{install['installed_automation_id']}", headers=headers)
    assert cloned.json()["status"] == "archived"


def test_uninstall_is_installer_scoped(client):
    automation = _create_automation(client)
    item = _publish(client, automation["id"]).json()
    other_token = _other_client_token(client)
    install = client.post(f"/api/marketplace/items/{item['id']}/install", headers={"Authorization": f"Bearer {other_token}"}).json()

    response = client.post(f"/api/marketplace/installs/{install['id']}/uninstall")
    assert response.status_code == 404


def test_list_mine_shows_every_status(client):
    automation = _create_automation(client)
    item = _publish(client, automation["id"]).json()
    client.post(f"/api/marketplace/items/{item['id']}/archive")

    mine = client.get("/api/marketplace/items/mine")
    assert [row["id"] for row in mine.json()] == [item["id"]]
    assert mine.json()[0]["status"] == "archived"


def test_republish_bumps_version_and_records_changelog(client):
    automation = _create_automation(client)
    item = _publish(client, automation["id"]).json()
    assert len(item["changelog"]) == 1

    republished = client.post(f"/api/marketplace/items/{item['id']}/republish", json={"note": "Bumped timeout."})
    assert republished.status_code == 200
    body = republished.json()
    assert body["version"] == 2
    assert [entry["note"] for entry in body["changelog"]] == ["Publicação inicial.", "Bumped timeout."]


def test_republish_fails_once_the_source_automation_is_deleted(client):
    automation = _create_automation(client)
    item = _publish(client, automation["id"]).json()
    client.delete(f"/api/automations/{automation['id']}")

    response = client.post(f"/api/marketplace/items/{item['id']}/republish", json={"note": "x"})
    assert response.status_code == 409


def test_category_is_derived_from_the_action_url_host(client):
    automation = _create_automation(client, action_config={"method": "POST", "url": "https://hooks.slack.com/services/x"})
    item = _publish(client, automation["id"]).json()
    assert item["category"] == "Integrações"


def test_category_falls_back_to_backend_for_an_unrecognized_manual_trigger_host(client):
    automation = _create_automation(client)  # default url: https://example.com, trigger_type: manual
    item = _publish(client, automation["id"]).json()
    assert item["category"] == "Backend"


def test_downloads_count_is_cumulative_and_survives_an_uninstall(client):
    automation = _create_automation(client)
    item = _publish(client, automation["id"]).json()
    assert item["downloads"] == 0

    other_token = _other_client_token(client)
    headers = {"Authorization": f"Bearer {other_token}"}
    install = client.post(f"/api/marketplace/items/{item['id']}/install", headers=headers).json()

    after_install = client.get(f"/api/marketplace/items/{item['id']}").json()
    assert after_install["downloads"] == 1

    client.post(f"/api/marketplace/installs/{install['id']}/uninstall", headers=headers)
    after_uninstall = client.get(f"/api/marketplace/items/{item['id']}").json()
    assert after_uninstall["downloads"] == 1  # never decrements


def test_update_available_flips_true_after_the_author_republishes(client):
    automation = _create_automation(client)
    item = _publish(client, automation["id"]).json()
    other_token = _other_client_token(client)
    headers = {"Authorization": f"Bearer {other_token}"}

    client.post(f"/api/marketplace/items/{item['id']}/install", headers=headers)
    installs_before = client.get("/api/marketplace/installs/mine", headers=headers).json()
    assert installs_before[0]["update_available"] is False
    assert installs_before[0]["current_item_version"] == 1

    client.post(f"/api/marketplace/items/{item['id']}/republish", json={"note": "v2"})
    installs_after = client.get("/api/marketplace/installs/mine", headers=headers).json()
    assert installs_after[0]["update_available"] is True
    assert installs_after[0]["current_item_version"] == 2
    assert installs_after[0]["item_version"] == 1  # the install itself still records the version installed


def test_installed_content_never_leaks_a_credential_placeholder_as_a_resolved_value(client):
    automation = _create_automation(client, action_config={"method": "GET", "url": "https://example.com", "headers": {"Authorization": "Bearer {{credential:token}}"}})
    client.put(f"/api/automations/{automation['id']}/credentials", json={"name": "token", "value": "sk-super-secret"})

    item = _publish(client, automation["id"]).json()
    assert "sk-super-secret" not in str(item)

    other_token = _other_client_token(client)
    install = client.post(f"/api/marketplace/items/{item['id']}/install", headers={"Authorization": f"Bearer {other_token}"})
    assert "sk-super-secret" not in install.text
