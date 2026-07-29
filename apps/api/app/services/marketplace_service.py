from __future__ import annotations

from copy import deepcopy
import re
from typing import Any
from urllib.parse import urlparse

from app.core.event_catalog import emit_named_event
from app.core.outbound_url import UnsafeOutboundUrlError, validate_public_http_url
from app.repositories.automation_repository import AutomationRepository
from app.repositories.marketplace_repository import MarketplaceRepository
from app.repositories.redaction import REDACTED, SENSITIVE_KEY_PATTERN, redact_text
from app.services.automation_service import AutomationService, automation_service


class MarketplaceSourceGoneError(RuntimeError):
    """Raised when republishing a marketplace item whose source Automation
    was deleted after the item was first published -- the item's last
    published content stays installable, but there is nothing new to pull."""


class UnsafeMarketplaceItemError(ValueError):
    """Marketplace content contains an unsafe destination or literal secret."""


_SENSITIVE_HEADERS = {"authorization", "proxy-authorization", "cookie", "set-cookie", "x-api-key", "api-key", "x-auth-token"}
_SECRET_ASSIGNMENT = re.compile(
    r"(?i)(password|token|api[_-]?key|secret)[\"']?\s*[:=]\s*[\"']?[^{}\s,\"']+"
)
_CREDENTIAL_PLACEHOLDER = "{{credential:"


def _contains_literal_secret(value: str) -> bool:
    return (
        _CREDENTIAL_PLACEHOLDER not in value
        and (redact_text(value) != value or _SECRET_ASSIGNMENT.search(value) is not None)
    )


def validate_publishable_content(content: dict[str, Any]) -> None:
    action_config = content.get("action_config") or {}
    try:
        validate_public_http_url(str(action_config.get("url") or ""), resolve_dns=False)
    except UnsafeOutboundUrlError as exc:
        raise UnsafeMarketplaceItemError(str(exc)) from exc
    for name, value in (action_config.get("headers") or {}).items():
        normalized = str(name).strip().lower()
        text = str(value)
        if (normalized in _SENSITIVE_HEADERS or SENSITIVE_KEY_PATTERN.search(normalized)) and _CREDENTIAL_PLACEHOLDER not in text:
            raise UnsafeMarketplaceItemError(f"Header sensível '{name}' deve usar {{credential:nome}}.")
        if _contains_literal_secret(text):
            raise UnsafeMarketplaceItemError(f"O header '{name}' contém um segredo literal.")
    for field in ("url", "body"):
        value = action_config.get(field)
        if value is not None and _contains_literal_secret(str(value)):
            raise UnsafeMarketplaceItemError(f"O campo '{field}' contém um segredo literal.")


def _public_content(content: dict[str, Any]) -> dict[str, Any]:
    """Redact legacy unsafe values so catalog reads never expose credentials."""
    safe = deepcopy(content)
    action_config = safe.get("action_config") or {}
    headers = action_config.get("headers") or {}
    for name, value in list(headers.items()):
        normalized = str(name).strip().lower()
        text = str(value)
        if (normalized in _SENSITIVE_HEADERS or SENSITIVE_KEY_PATTERN.search(normalized)) and _CREDENTIAL_PLACEHOLDER not in text:
            headers[name] = REDACTED
        else:
            headers[name] = redact_text(text)
    for field in ("body", "url"):
        if action_config.get(field) is None:
            continue
        text = str(action_config[field])
        action_config[field] = REDACTED if _contains_literal_secret(text) else redact_text(text)
    return safe


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


# Hostname keyword -> category label. Computed, never stored: real variety is
# thin today because the automation engine only ever executes action_type
# "http_request" (anything else is rejected at run time), so most real items
# fall through to the trigger-based fallback below -- that's an honest
# reflection of current platform usage, not a derivation bug.
_CATEGORY_HOST_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("IA", ("openai.com", "anthropic.com", "generativelanguage.googleapis.com", "api.deepseek.com", "groq.com")),
    ("Cloud", ("amazonaws.com", "azure.com", "cloudflare.com", "digitalocean.com", "vercel.com", "hostinger.com")),
    ("DevOps", ("github.com", "gitlab.com", "circleci.com", "hooks.docker.com")),
    ("Banco de Dados", ("supabase.co", "mongodb.net", "planetscale.com", "neon.tech", "firebaseio.com")),
    ("Segurança", ("auth0.com", "okta.com", "vault.")),
    ("Integrações", ("slack.com", "hooks.zapier.com", "discord.com", "api.telegram.org", "notion.so", "hubspot.com", "salesforce.com")),
)


def derive_category(content: dict[str, Any]) -> str:
    """Real, computed category from the item's actual trigger/action config
    -- never author-declared, matching the same "verificável" principle as
    _derive_permissions. Not persisted: recomputed on every read so it always
    reflects the current content."""
    if content.get("action_type") != "http_request":
        return "Automação"
    action_config = content.get("action_config") or {}
    host = urlparse(action_config.get("url") or "").netloc.lower()
    for label, needles in _CATEGORY_HOST_RULES:
        if any(needle in host for needle in needles):
            return label
    return "Backend" if content.get("trigger_type") == "manual" else "Automação"


class MarketplaceService:
    def __init__(
        self, repository: MarketplaceRepository | None = None,
        automation_repository: AutomationRepository | None = None,
        automation_service_: AutomationService | None = None,
    ) -> None:
        self.repository = repository or MarketplaceRepository()
        self.automation_repository = automation_repository or AutomationRepository()
        self.automation_service = automation_service_ or automation_service

    def _enrich_items(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Adds computed, never-persisted fields (category, downloads) to
        every item dict returned to a caller -- single place so no read path
        can forget one and violate the response schema."""
        downloads = self.repository.count_installs_for_items([item["id"] for item in items])
        for item in items:
            item["category"] = derive_category(item["content"])
            item["downloads"] = downloads.get(item["id"], 0)
            item["content"] = _public_content(item["content"])
        return items

    def _enrich_item(self, item: dict[str, Any] | None) -> dict[str, Any] | None:
        if item is None:
            return None
        return self._enrich_items([item])[0]

    def publish(
        self, *, author_user_id: str, source_automation_id: str, name: str, description: str, license: str,
    ) -> dict[str, Any] | None:
        automation = self.automation_repository.get_for_owner(source_automation_id, author_user_id)
        if automation is None:
            return None
        content = _content_from_automation(automation)
        validate_publishable_content(content)
        item = self.repository.create_item(
            author_user_id=author_user_id, source_automation_id=source_automation_id, name=name,
            description=description, license=license, permissions=_derive_permissions(automation),
            content=content,
        )
        item = self.repository.set_status(item["id"], author_user_id, "published")
        emit_named_event("MarketplaceItemPublished", author_user_id, metadata={"item_id": item["id"], "version": item["version"]})
        return self._enrich_item(item)

    def list_catalog(self, *, search: str | None = None) -> list[dict[str, Any]]:
        return self._enrich_items(self.repository.list_published(search=search))

    def get_detail(self, item_id: str, viewer_user_id: str) -> dict[str, Any] | None:
        item = self.repository.get_item(item_id)
        if item is None:
            return None
        if item["status"] != "published" and item["author_user_id"] != viewer_user_id:
            return None
        return self._enrich_item(item)

    def list_mine(self, author_user_id: str) -> list[dict[str, Any]]:
        return self._enrich_items(self.repository.list_for_author(author_user_id))

    def archive(self, item_id: str, author_user_id: str) -> dict[str, Any] | None:
        return self._enrich_item(self.repository.set_status(item_id, author_user_id, "archived"))

    def republish(self, item_id: str, author_user_id: str, *, note: str) -> dict[str, Any] | None:
        item = self.repository.get_item(item_id)
        if item is None or item["author_user_id"] != author_user_id:
            return None
        automation = self.automation_repository.get_for_owner(item["source_automation_id"], author_user_id)
        if automation is None:
            raise MarketplaceSourceGoneError("A automação de origem deste item não existe mais.")
        content = _content_from_automation(automation)
        validate_publishable_content(content)
        updated = self.repository.update_content(item_id, author_user_id, content=content, note=note)
        emit_named_event("MarketplaceItemPublished", author_user_id, metadata={"item_id": item_id, "version": updated["version"]})
        return self._enrich_item(updated)

    def install(self, item_id: str, installer_user_id: str) -> dict[str, Any] | None:
        item = self.repository.get_item(item_id)
        if item is None or item["status"] != "published":
            return None
        content = item["content"]
        validate_publishable_content(content)
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
        installs = self.repository.list_installs_for_user(installer_user_id)
        items_by_id = self.repository.get_items_by_ids(list({install["item_id"] for install in installs}))
        for install in installs:
            item = items_by_id.get(install["item_id"])
            install["current_item_version"] = item["version"] if item else None
            install["update_available"] = bool(item and item["version"] > install["item_version"])
        return installs

    def uninstall(self, install_id: str, installer_user_id: str) -> dict[str, Any] | None:
        install = self.repository.get_install(install_id, installer_user_id)
        if install is None:
            return None
        self.automation_service.archive(install["installed_automation_id"], installer_user_id)
        return self.repository.mark_uninstalled(install_id, installer_user_id)


marketplace_service = MarketplaceService()
