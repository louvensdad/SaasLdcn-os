from __future__ import annotations

from typing import Any

from app.core.event_catalog import emit_named_event
from app.repositories.automation_repository import AutomationRepository
from app.repositories.marketplace_repository import MarketplaceRepository
from app.services.automation_service import AutomationService, automation_service


class MarketplaceSourceGoneError(RuntimeError):
    """Raised when republishing a marketplace item whose source Automation
    was deleted after the item was first published -- the item's last
    published content stays installable, but there is nothing new to pull."""


def _content_from_automation(automation: dict[str, Any]) -> dict[str, Any]:
    return {
        "trigger_type": automation["trigger_type"], "trigger_config": automation["trigger_config"],
        "action_type": automation["action_type"], "action_config": automation["action_config"],
    }


def _derive_permissions(automation: dict[str, Any]) -> list[str]:
    """Deterministic, not author-declared -- satisfies the Marketplace
    Contract's "permissões são verificáveis" honestly: what an installed
    clone can do is exactly its trigger and action type, nothing an author
    could misrepresent."""
    return [f"trigger:{automation['trigger_type']}", f"action:{automation['action_type']}"]


class MarketplaceService:
    def __init__(
        self, repository: MarketplaceRepository | None = None,
        automation_repository: AutomationRepository | None = None,
        automation_service_: AutomationService | None = None,
    ) -> None:
        self.repository = repository or MarketplaceRepository()
        self.automation_repository = automation_repository or AutomationRepository()
        self.automation_service = automation_service_ or automation_service

    def publish(
        self, *, author_user_id: str, source_automation_id: str, name: str, description: str, license: str,
    ) -> dict[str, Any] | None:
        automation = self.automation_repository.get_for_owner(source_automation_id, author_user_id)
        if automation is None:
            return None
        item = self.repository.create_item(
            author_user_id=author_user_id, source_automation_id=source_automation_id, name=name,
            description=description, license=license, permissions=_derive_permissions(automation),
            content=_content_from_automation(automation),
        )
        item = self.repository.set_status(item["id"], author_user_id, "published")
        emit_named_event("MarketplaceItemPublished", author_user_id, metadata={"item_id": item["id"], "version": item["version"]})
        return item

    def list_catalog(self, *, search: str | None = None) -> list[dict[str, Any]]:
        return self.repository.list_published(search=search)

    def get_detail(self, item_id: str, viewer_user_id: str) -> dict[str, Any] | None:
        item = self.repository.get_item(item_id)
        if item is None:
            return None
        if item["status"] != "published" and item["author_user_id"] != viewer_user_id:
            return None
        return item

    def list_mine(self, author_user_id: str) -> list[dict[str, Any]]:
        return self.repository.list_for_author(author_user_id)

    def archive(self, item_id: str, author_user_id: str) -> dict[str, Any] | None:
        return self.repository.set_status(item_id, author_user_id, "archived")

    def republish(self, item_id: str, author_user_id: str, *, note: str) -> dict[str, Any] | None:
        item = self.repository.get_item(item_id)
        if item is None or item["author_user_id"] != author_user_id:
            return None
        automation = self.automation_repository.get_for_owner(item["source_automation_id"], author_user_id)
        if automation is None:
            raise MarketplaceSourceGoneError("A automação de origem deste item não existe mais.")
        content = _content_from_automation(automation)
        updated = self.repository.update_content(item_id, author_user_id, content=content, note=note)
        emit_named_event("MarketplaceItemPublished", author_user_id, metadata={"item_id": item_id, "version": updated["version"]})
        return updated

    def install(self, item_id: str, installer_user_id: str) -> dict[str, Any] | None:
        item = self.repository.get_item(item_id)
        if item is None or item["status"] != "published":
            return None
        content = item["content"]
        automation = self.automation_service.create(
            owner_user_id=installer_user_id, title=f"{item['name']} (Marketplace)", description=item["description"],
            trigger_type=content["trigger_type"], trigger_config=content["trigger_config"],
            action_type=content["action_type"], action_config=content["action_config"],
        )
        install = self.repository.create_install(
            item_id=item_id, item_version=item["version"], installer_user_id=installer_user_id,
            installed_automation_id=automation["id"],
        )
        emit_named_event(
            "MarketplaceItemInstalled", installer_user_id,
            metadata={"item_id": item_id, "automation_id": automation["id"]},
        )
        return install

    def list_my_installs(self, installer_user_id: str) -> list[dict[str, Any]]:
        return self.repository.list_installs_for_user(installer_user_id)

    def uninstall(self, install_id: str, installer_user_id: str) -> dict[str, Any] | None:
        install = self.repository.get_install(install_id, installer_user_id)
        if install is None:
            return None
        self.automation_service.archive(install["installed_automation_id"], installer_user_id)
        return self.repository.mark_uninstalled(install_id, installer_user_id)


marketplace_service = MarketplaceService()
