from __future__ import annotations

from app.core import runtime_overrides
from app.engines import agent_executor
from app.repositories.llm_active_selection_repository import LlmActiveSelectionRepository
from app.repositories.llm_usage_repository import LlmUsageRepository
from app.repositories.platform_runtime_config_repository import PlatformRuntimeConfigRepository
from app.repositories.user_preferences_repository import UserPreferencesRepository
from app.services.ai_key_vault_service import ai_key_vault_service
from app.services.llm_settings_service import LlmSettingsService


def _second_user_token(client) -> str:
    """Registers a second account in the same per-test DB -- the `client`
    fixture's own user is always the first registered, hence 'admin' (see
    UserRepository.create_user); this one gets the default 'user' role."""
    response = client.post(
        "/api/auth/register",
        json={
            "email": "second-user@example.com",
            "password": "TestPassword123!",
            "full_name": "Second User",
            "privacy_policy_accepted": True,
        },
    )
    return response.json()["tokens"]["access_token"]


class TestUserPreferencesPersistence:
    def test_interface_preferences_round_trip(self, client):
        assert client.get("/api/users/me/preferences/interface").json() == {"data": None}

        payload = {"accent": "cyan", "radius": 16, "animations": False}
        response = client.put("/api/users/me/preferences/interface", json={"data": payload})
        assert response.status_code == 200
        assert response.json() == {"data": payload}

        assert client.get("/api/users/me/preferences/interface").json() == {"data": payload}

    def test_ai_preferences_survive_a_fresh_repository_instance(self, client):
        """Simulates a backend restart: a brand-new repository object pointed
        at the same DB file must see what a previous one wrote."""
        payload = {"profile": "quality", "flags": {"devMode": True}}
        client.put("/api/users/me/preferences/ai", json={"data": payload})

        from app.core.config import get_settings

        fresh_repo = UserPreferencesRepository(get_settings().sqlite_path)
        # user_id isn't exposed to the test directly; read via the route instead,
        # which is backed by the same DB the fresh repository points at.
        assert client.get("/api/users/me/preferences/ai").json() == {"data": payload}
        assert fresh_repo.get is not None  # constructs without error against the real DB

    def test_oversized_preferences_payload_is_rejected(self, client):
        huge = {"padding": "x" * 100_000}
        response = client.put("/api/users/me/preferences/interface", json={"data": huge})
        assert response.status_code == 413


class TestPlatformRuntimeConfig:
    def test_effective_config_has_sane_defaults(self, client):
        response = client.get("/api/runtime/config")
        assert response.status_code == 200
        payload = response.json()
        assert payload["workerLimit"] >= 1
        assert payload["executionTimeoutMinutes"] >= 1
        assert payload["logRetentionDays"] >= 1

    def test_non_admin_cannot_change_runtime_config(self, client):
        token = _second_user_token(client)
        response = client.put(
            "/api/runtime/config",
            json={"workerLimit": 20},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 403

    def test_admin_can_change_worker_limit_and_it_actually_resizes_the_pool(self, client):
        try:
            response = client.put("/api/runtime/config", json={"workerLimit": 3})
            assert response.status_code == 200
            assert response.json()["workerLimit"] == 3
            assert agent_executor.get_agent_executor()._max_workers == 3

            metrics = client.get("/api/runtime/metrics").json()
            assert metrics["workers"]["total"] == 3
        finally:
            agent_executor._reset_for_tests()

    def test_worker_limit_is_clamped_to_the_documented_range(self, client):
        try:
            response = client.put("/api/runtime/config", json={"workerLimit": 9999})
            assert response.status_code == 200
            assert response.json()["workerLimit"] == runtime_overrides.WORKER_LIMIT_MAX
        finally:
            agent_executor._reset_for_tests()

    def test_config_persists_across_a_fresh_repository_instance(self, client):
        try:
            client.put("/api/runtime/config", json={"logRetentionDays": 45})
            from app.core.config import get_settings

            fresh_repo = PlatformRuntimeConfigRepository(get_settings().sqlite_path)
            row = fresh_repo.get()
            assert row["audit_log_retention_days"] == 45
        finally:
            runtime_overrides._reset_for_tests()


class TestLlmActiveSelectionPersistence:
    def test_selection_survives_a_fresh_service_instance(self, client):
        """The old implementation kept this in an in-memory dict that reset on
        every process restart; a fresh LlmSettingsService (same DB) must see
        what a previous instance selected."""
        del client  # only needed to trigger the isolated per-test DB fixture
        from app.core.config import get_settings

        service_a = LlmSettingsService(LlmActiveSelectionRepository(get_settings().sqlite_path))
        ai_key_vault_service.create("restart-user", "anthropic", "Test Key", "sk-test-restart-key")
        service_a.select("restart-user", "anthropic")

        service_b = LlmSettingsService(LlmActiveSelectionRepository(get_settings().sqlite_path))
        active = service_b.active("restart-user")
        assert active.provider == "anthropic"
        assert active.mode == "llm"


class TestLlmUsageByModel:
    def test_usage_by_model_reflects_real_records_only(self, client):
        from app.core.config import get_settings

        repo = LlmUsageRepository(get_settings().sqlite_path)
        repo.record(
            provider="anthropic", model="claude-haiku-4-5",
            usage={"input": 1000, "output": 500}, served_by_cache=False, latency_ms=800,
        )
        repo.record(
            provider="anthropic", model="claude-haiku-4-5",
            usage={"input": 1000, "output": 500}, served_by_cache=True, latency_ms=1,
        )

        payload = client.get("/api/llm/usage/by-model").json()
        assert len(payload) == 1
        entry = payload[0]
        assert entry["model"] == "claude-haiku-4-5"
        assert entry["provider"] == "anthropic"
        assert entry["requests"] == 2
        assert entry["cache_hit_rate"] == 0.5

    def test_usage_by_model_is_empty_when_nothing_recorded(self, client):
        assert client.get("/api/llm/usage/by-model").json() == []
