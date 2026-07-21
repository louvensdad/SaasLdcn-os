from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.automation import ActionConfig, TriggerConfig
from app.schemas.common import ApiModel

MarketplaceItemStatus = Literal["draft", "published", "archived"]
MarketplaceItemKind = Literal["automation_template"]


class MarketplaceItemContent(ApiModel):
    trigger_type: Literal["manual", "scheduled"]
    trigger_config: TriggerConfig
    action_type: str
    action_config: ActionConfig


class MarketplaceItemChangelogEntry(ApiModel):
    version: int
    note: str
    published_at: str


class MarketplaceItem(ApiModel):
    id: str
    author_user_id: str
    kind: MarketplaceItemKind
    source_automation_id: str
    name: str
    description: str
    license: str
    permissions: list[str] = Field(default_factory=list)
    price_cents: int
    version: int
    content: MarketplaceItemContent
    content_hash: str
    changelog: list[MarketplaceItemChangelogEntry] = Field(default_factory=list)
    status: MarketplaceItemStatus
    created_at: str
    updated_at: str
    # Computed, never persisted -- see marketplace_service.derive_category /
    # MarketplaceRepository.count_installs_for_items.
    category: str
    downloads: int = 0


class PublishMarketplaceItemRequest(ApiModel):
    source_automation_id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    license: str = Field(default="Proprietary", min_length=1, max_length=80)


class RepublishMarketplaceItemRequest(ApiModel):
    note: str = Field(min_length=1, max_length=400)


class MarketplaceInstall(ApiModel):
    id: str
    item_id: str
    item_version: int
    installed_automation_id: str
    installed_at: str
    uninstalled_at: str | None = None
    # Computed, never persisted -- see MarketplaceService.list_my_installs.
    current_item_version: int | None = None
    update_available: bool = False
