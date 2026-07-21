from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.core.config import get_settings
from app.core.database import session_factory
from app.core.security import decode_token
from app.models.billing import PlanLimit, TrialRecord
from app.repositories.billing_repository import BillingRepository
from app.repositories.metering_repository import MeteringRepository, current_period_start
from app.services.plan_access_engine import PlanAccessDeniedError, PlanAccessEngine


def _user_id_from(client) -> str:
    token = client.headers["Authorization"].split(" ", 1)[1]
    return str(decode_token(token, expected_type="access")["sub"])


def _expire_trial(user_id: str) -> None:
    sessions = session_factory(get_settings().sqlite_path)
    with sessions.begin() as session:
        row = session.get(TrialRecord, user_id)
        row.expires_at = "2000-01-01T00:00:00+00:00"


def _build_blueprint(client):
    payload = {
        "project_name": f"ldcn-billing-{uuid4().hex[:8]}",
        "language_id": "typescript",
        "runtime_id": "nodejs",
        "framework_id": "nestjs",
        "architecture_id": "modular_monolith",
        "archetype_id": "ai_saas",
        "capability_ids": ["authentication", "rbac", "ai_chat", "analytics", "rate_limiting", "observability"],
        "business_module_ids": ["users", "reports", "subscriptions", "notifications"],
        "endpoint_ids": ["auth.login", "auth.register", "auth.me", "analytics.overview", "ai.chat"],
        "locale": "pt-BR",
        "generation_mode": "local_build_90",
        "project_requirements": {
            "project_goal": "Deliver a governed billing test application.",
            "business_context": "Commercial SaaS operation.",
            "target_users": ["operators", "customers"],
            "business_rules": ["Authorized users manage records."],
            "entities": ["User", "Subscription"],
            "workflows": ["Customer request is reviewed by an operator."],
            "constraints": ["Protect personal data."],
            "delivery_target": "github",
        },
    }
    response = client.post("/api/blueprints/preview", json=payload)
    assert response.status_code == 200
    return response.json()


def _build_prompt_master(client, blueprint: dict):
    response = client.post("/api/prompt-master/preview", json={"blueprint": blueprint})
    assert response.status_code == 200
    return response.json()


def _build_gatekeeper(client, blueprint: dict, prompt_master: dict):
    response = client.post(
        "/api/gatekeeper/preview",
        json={"blueprint": blueprint, "prompt_master": prompt_master},
    )
    assert response.status_code == 200
    return response.json()


def _save_project(client):
    blueprint = _build_blueprint(client)
    prompt_master = _build_prompt_master(client, blueprint)
    gatekeeper = _build_gatekeeper(client, blueprint, prompt_master)
    return client.post(
        "/api/projects/save-from-wizard",
        json={"blueprint": blueprint, "prompt_master": prompt_master, "gatekeeper": gatekeeper},
    )


def test_plan_catalog_has_no_fabricated_pricing_or_limits(client):
    response = client.get("/api/billing/plans")
    assert response.status_code == 200
    plans = {item["code"]: item for item in response.json()}

    assert set(plans) == {"BASIC", "ADVANCED", "PRO", "STUDENT"}
    # Vault: Básico/Avançado/Pro pricing is "política comercial" -- genuinely
    # undefined, never a fabricated number. Only Estudante has a real price.
    assert plans["BASIC"]["price_cents"] is None
    assert plans["ADVANCED"]["price_cents"] is None
    assert plans["PRO"]["price_cents"] is None
    assert plans["STUDENT"]["price_cents"] == 3000

    assert plans["BASIC"]["limits"]["active_projects"] == 3
    assert plans["ADVANCED"]["limits"]["active_projects"] == 15
    assert plans["PRO"]["limits"]["active_projects"] is None
    # "limitado"/"maior" in the vault table are qualitative, not numbers.
    assert plans["BASIC"]["limits"]["monthly_ai_credits"] is None
    assert plans["BASIC"]["limits"]["monthly_builds"] is None

    assert "WORKSPACE_CREATE" not in plans["BASIC"]["features"]
    assert "WORKSPACE_CREATE" in plans["ADVANCED"]["features"]
    assert "MARKETPLACE_ACCESS" not in plans["ADVANCED"]["features"]
    assert "MARKETPLACE_ACCESS" in plans["PRO"]["features"]
    assert plans["STUDENT"]["features"] == plans["BASIC"]["features"]


def test_trial_starts_automatically_at_registration(client):
    response = client.get("/api/billing/trial")
    assert response.status_code == 200
    trial = response.json()
    assert trial["status"] == "ACTIVE"
    assert trial["started_at"] < trial["expires_at"]


def test_subscribing_replaces_the_previous_subscription(client):
    organization_id = client.get("/api/organizations").json()[0]["organization_id"]

    first = client.post("/api/billing/subscription", json={"plan_code": "basic"})
    assert first.status_code == 201
    assert first.json()["plan_code"] == "BASIC"
    assert first.json()["organization_id"] == organization_id
    assert first.json()["status"] == "ACTIVE"

    second = client.post("/api/billing/subscription", json={"plan_code": "advanced"})
    assert second.status_code == 201
    assert second.json()["plan_code"] == "ADVANCED"

    current = client.get("/api/billing/subscription")
    assert current.status_code == 200
    assert current.json()["id"] == second.json()["id"]


def test_subscribe_to_unknown_plan_returns_plan_not_found(client):
    response = client.post("/api/billing/subscription", json={"plan_code": "nonexistent"})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "PLAN_NOT_FOUND"


def test_cancel_subscription(client):
    client.post("/api/billing/subscription", json={"plan_code": "basic"})
    cancelled = client.post("/api/billing/subscription/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "CANCELLED"

    assert client.get("/api/billing/subscription").json() is None


def test_trial_expiry_blocks_project_and_workspace_creation_until_subscribed(client):
    _expire_trial(_user_id_from(client))

    blocked_project = _save_project(client)
    assert blocked_project.status_code == 403
    detail = blocked_project.json()["detail"]
    assert detail["code"] == "TRIAL_EXPIRED"
    assert detail["correlation_id"]
    assert detail["timestamp"]

    organization_id = client.get("/api/organizations").json()[0]["organization_id"]
    blocked_workspace = client.post(f"/api/organizations/{organization_id}/workspaces", json={"name": "Extra"})
    assert blocked_workspace.status_code == 403
    assert blocked_workspace.json()["detail"]["code"] == "TRIAL_EXPIRED"

    subscribed = client.post("/api/billing/subscription", json={"plan_code": "advanced"})
    assert subscribed.status_code == 201

    unblocked_project = _save_project(client)
    assert unblocked_project.status_code == 201

    unblocked_workspace = client.post(f"/api/organizations/{organization_id}/workspaces", json={"name": "Extra"})
    assert unblocked_workspace.status_code == 201


def test_subscription_without_active_trial_or_plan_requires_subscription(client):
    _expire_trial(_user_id_from(client))
    response = _save_project(client)
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "TRIAL_EXPIRED"


def test_plan_feature_not_available_blocks_workspace_creation_on_basic(client):
    organization_id = client.get("/api/organizations").json()[0]["organization_id"]
    client.post("/api/billing/subscription", json={"plan_code": "basic"})

    response = client.post(f"/api/organizations/{organization_id}/workspaces", json={"name": "Nope"})
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "PLAN_FEATURE_NOT_AVAILABLE"


def test_project_limit_reached_after_basic_plans_active_project_cap(client):
    client.post("/api/billing/subscription", json={"plan_code": "basic"})

    for _ in range(3):
        response = _save_project(client)
        assert response.status_code == 201

    fourth = _save_project(client)
    assert fourth.status_code == 403
    detail = fourth.json()["detail"]
    assert detail["code"] == "PROJECT_LIMIT_REACHED"
    assert detail["details"]["usage"] == 3
    assert detail["details"]["value"] == 3


def test_workspace_limit_reached_on_advanced_plan(client):
    organization_id = client.get("/api/organizations").json()[0]["organization_id"]
    client.post("/api/billing/subscription", json={"plan_code": "advanced"})

    # 1 personal workspace already exists; ADVANCED allows 5 total.
    for index in range(4):
        response = client.post(f"/api/organizations/{organization_id}/workspaces", json={"name": f"Team {index}"})
        assert response.status_code == 201

    sixth = client.post(f"/api/organizations/{organization_id}/workspaces", json={"name": "One too many"})
    assert sixth.status_code == 403
    detail = sixth.json()["detail"]
    assert detail["code"] == "WORKSPACE_LIMIT_REACHED"
    assert detail["details"]["usage"] == 5


def test_workspace_creation_checks_permission_before_plan_state(client):
    second_response = client.post(
        "/api/auth/register",
        json={
            "email": f"second_{uuid4().hex}@example.com",
            "password": "TestPassword123!",
            "full_name": "Second User",
            "privacy_policy_accepted": True,
        },
    )
    second_token = second_response.json()["tokens"]["access_token"]
    organization_id = client.get("/api/organizations").json()[0]["organization_id"]
    _expire_trial(_user_id_from(client))

    response = client.post(
        f"/api/organizations/{organization_id}/workspaces",
        headers={"Authorization": f"Bearer {second_token}"},
        json={"name": "Not a member"},
    )
    assert response.status_code == 404


def test_plan_catalog_is_public_and_ignores_the_authorization_header(client):
    response = client.get("/api/billing/plans", headers={"Authorization": "Bearer not-a-real-token"})
    assert response.status_code == 200
    assert {item["code"] for item in response.json()} == {"BASIC", "ADVANCED", "PRO", "STUDENT"}


def test_subscribing_during_an_active_trial_converts_it(client):
    trial = client.get("/api/billing/trial").json()
    assert trial["status"] == "ACTIVE"

    response = client.post("/api/billing/subscription", json={"plan_code": "basic"})
    assert response.status_code == 201

    converted = client.get("/api/billing/trial").json()
    assert converted["status"] == "CONVERTED"
    assert converted["converted_at"] is not None


def _generation_job_payload(project_id: str) -> dict:
    return {
        "projectId": project_id,
        "projectName": "Billing Gate Project",
        "spec": {
            "raw_intent": "Sistema de pedidos",
            "product_summary": "Operacao de pedidos auditavel",
            "entities": ["Order"],
            "business_rules": ["Somente operadores aprovam pedidos"],
            "core_workflows": ["Criar e aprovar pedido"],
        },
        "blueprint": {"decisions": []},
        "blueprintVersion": 1,
        "mode": "deterministic",
    }


def test_trial_expiry_blocks_generation_job_creation(client):
    # projectId deliberately doesn't resolve to any Project Room -- the plan
    # check runs before room resolution, so an ad-hoc/API caller is still gated.
    _expire_trial(_user_id_from(client))
    response = client.post("/api/meta-factory/jobs", json=_generation_job_payload(f"proj_{uuid4().hex[:8]}"))
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "TRIAL_EXPIRED"


def test_check_preview_create_enforces_the_plans_preview_instances_limit(client):
    user_id = _user_id_from(client)
    organization_id = client.get("/api/organizations").json()[0]["organization_id"]
    client.post("/api/billing/subscription", json={"plan_code": "basic"})  # preview_instances = 1

    engine = PlanAccessEngine(live_preview=SimpleNamespace(active_count_for_owner=lambda *a, **kw: 0))
    engine.check_preview_create(user_id=user_id, organization_id=organization_id)  # no error: under the cap

    engine_at_cap = PlanAccessEngine(live_preview=SimpleNamespace(active_count_for_owner=lambda *a, **kw: 1))
    with pytest.raises(PlanAccessDeniedError) as excinfo:
        engine_at_cap.check_preview_create(user_id=user_id, organization_id=organization_id)
    assert excinfo.value.code == "PREVIEW_LIMIT_REACHED"


def test_check_build_execute_is_a_noop_without_a_configured_monthly_builds_limit(client):
    # Vault: monthly_builds is "limitado"/"maior" (qualitative) for Basic/Advanced
    # -- no plan defines a real number, so this must never fabricate a block.
    user_id = _user_id_from(client)
    organization_id = client.get("/api/organizations").json()[0]["organization_id"]
    client.post("/api/billing/subscription", json={"plan_code": "basic"})

    PlanAccessEngine().check_build_execute(user_id=user_id, organization_id=organization_id)


def test_check_build_execute_enforces_monthly_builds_once_a_real_limit_is_configured(client):
    user_id = _user_id_from(client)
    organization_id = client.get("/api/organizations").json()[0]["organization_id"]
    client.post("/api/billing/subscription", json={"plan_code": "basic"})
    BillingRepository().plans()  # ensure_catalog side effect: rows exist to mutate below

    sessions = session_factory(get_settings().sqlite_path)
    with sessions.begin() as session:
        row = session.get(PlanLimit, ("BASIC", "monthly_builds"))
        row.limit_value = 1.0

    metering = MeteringRepository(get_settings().sqlite_path)
    metering.record(owner_user_id=user_id, resource_type="generation_run", quantity=1, unit="count", origin="generation_job:test")

    with pytest.raises(PlanAccessDeniedError) as excinfo:
        PlanAccessEngine().check_build_execute(user_id=user_id, organization_id=organization_id)
    assert excinfo.value.code == "BUILD_LIMIT_REACHED"
    assert metering.sum_for_owner(user_id, "generation_run", since=current_period_start()) == 1.0
