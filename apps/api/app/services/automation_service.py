from __future__ import annotations

from typing import Any

from croniter import CroniterBadCronError

from app.engines.automation_engine import run_automation
from app.repositories.automation_repository import AutomationRepository
from app.services.automation_scheduler import compute_next_run_at


class AutomationValidationError(ValueError):
    """A malformed cron expression or similar input error -- caught and
    surfaced as a 422 at creation/activation time, never left to fail
    silently inside the background poller later."""


class AutomationService:
    def __init__(self, repository: AutomationRepository | None = None) -> None:
        self.repository = repository or AutomationRepository()

    def create(self, *, owner_user_id: str, **kwargs: Any) -> dict[str, Any]:
        trigger_config = kwargs.get("trigger_config") or {}
        if kwargs.get("trigger_type") == "scheduled":
            self._validate_cron(trigger_config)
        return self.repository.create(owner_user_id=owner_user_id, **kwargs)

    def get(self, automation_id: str, owner_user_id: str) -> dict[str, Any] | None:
        return self.repository.get_for_owner(automation_id, owner_user_id)

    def list_for_owner(self, owner_user_id: str) -> list[dict[str, Any]]:
        return self.repository.list_for_owner(owner_user_id)

    def delete(self, automation_id: str, owner_user_id: str) -> bool:
        return self.repository.delete_for_owner(automation_id, owner_user_id)

    def activate(self, automation_id: str, owner_user_id: str) -> dict[str, Any] | None:
        automation = self.repository.get_for_owner(automation_id, owner_user_id)
        if automation is None:
            return None
        if automation["trigger_type"] == "scheduled":
            next_run_at = self._validate_cron(automation["trigger_config"])
            self.repository.set_next_run_at(automation_id, next_run_at)
        return self.repository.set_status(automation_id, owner_user_id, "active")

    def pause(self, automation_id: str, owner_user_id: str) -> dict[str, Any] | None:
        return self.repository.set_status(automation_id, owner_user_id, "paused")

    def archive(self, automation_id: str, owner_user_id: str) -> dict[str, Any] | None:
        return self.repository.set_status(automation_id, owner_user_id, "archived")

    def set_credential(self, automation_id: str, owner_user_id: str, name: str, value: str) -> dict[str, Any] | None:
        automation = self.repository.get_for_owner(automation_id, owner_user_id)
        if automation is None:
            return None
        return self.repository.set_credential(automation_id, owner_user_id, name, value)

    def list_credentials(self, automation_id: str, owner_user_id: str) -> list[dict[str, Any]] | None:
        automation = self.repository.get_for_owner(automation_id, owner_user_id)
        if automation is None:
            return None
        return self.repository.list_credentials(automation_id)

    def delete_credential(self, automation_id: str, owner_user_id: str, name: str) -> bool | None:
        automation = self.repository.get_for_owner(automation_id, owner_user_id)
        if automation is None:
            return None
        return self.repository.delete_credential(automation_id, name)

    def run_now(self, automation_id: str, owner_user_id: str) -> dict[str, Any] | None:
        automation = self.repository.get_for_owner(automation_id, owner_user_id)
        if automation is None:
            return None
        return run_automation(automation, trigger_source="manual", repository=self.repository)

    def list_runs(self, automation_id: str, owner_user_id: str) -> list[dict[str, Any]] | None:
        automation = self.repository.get_for_owner(automation_id, owner_user_id)
        if automation is None:
            return None
        return self.repository.list_runs(automation_id, owner_user_id)

    @staticmethod
    def _validate_cron(trigger_config: dict[str, Any]) -> str:
        cron_expr = trigger_config.get("cron")
        if not cron_expr:
            raise AutomationValidationError("A scheduled automation requires a cron expression.")
        try:
            return compute_next_run_at(cron_expr, trigger_config.get("timezone") or "UTC")
        except (CroniterBadCronError, ValueError) as exc:
            raise AutomationValidationError(f"Invalid cron expression '{cron_expr}': {exc}") from exc


automation_service = AutomationService()
