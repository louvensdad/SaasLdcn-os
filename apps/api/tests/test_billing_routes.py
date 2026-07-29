from __future__ import annotations

from app.engines import metering_engine


def test_usage_summary_starts_empty(client):
    response = client.get("/api/billing/usage")
    assert response.status_code == 200
    assert response.json()["items"] == []


def test_usage_summary_reflects_real_recorded_consumption(client):
    user_id = client.get("/api/auth/me").json()["user_id"]
    metering_engine.record_consumption(owner_user_id=user_id, resource_type="llm_tokens", quantity=250, unit="tokens", origin="test")

    response = client.get("/api/billing/usage")
    assert response.status_code == 200
    items = {item["resource_type"]: item["quantity"] for item in response.json()["items"]}
    assert items["llm_tokens"] == 250


def test_entitlement_is_unlimited_before_any_limit_is_set(client):
    response = client.get("/api/billing/entitlements/generation_run")
    assert response.status_code == 200
    body = response.json()
    assert body["monthly_limit"] is None
    assert body["allowed"] is True


def test_set_entitlement_limit_and_see_it_reflected(client):
    set_response = client.put("/api/billing/entitlements", json={"resource_type": "generation_run", "monthly_limit": 10})
    assert set_response.status_code == 200
    assert set_response.json()["monthly_limit"] == 10

    fetched = client.get("/api/billing/entitlements/generation_run")
    assert fetched.json()["monthly_limit"] == 10


def test_set_entitlement_limit_rejects_an_unknown_resource_type(client):
    response = client.put("/api/billing/entitlements", json={"resource_type": "not_a_real_resource", "monthly_limit": 10})
    assert response.status_code == 422


def test_list_entitlements_covers_every_known_resource_type(client):
    response = client.get("/api/billing/entitlements")
    assert response.status_code == 200
    resource_types = {item["resource_type"] for item in response.json()}
    assert resource_types == set(metering_engine.RESOURCE_TYPES)


def test_entitlements_are_owner_scoped_across_users(client):
    from uuid import uuid4

    client.put("/api/billing/entitlements", json={"resource_type": "generation_run", "monthly_limit": 3})

    register = client.post(
        "/api/auth/register",
        json={"email": f"billing_{uuid4().hex}@example.com", "password": "TestPassword123!", "full_name": "Other", "privacy_policy_accepted": True},
    )
    other_token = register.json()["tokens"]["access_token"]

    response = client.get("/api/billing/entitlements/generation_run", headers={"Authorization": f"Bearer {other_token}"})
    assert response.json()["monthly_limit"] is None
