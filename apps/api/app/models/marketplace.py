from __future__ import annotations

from sqlalchemy import Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class MarketplaceItem(Base):
    """A declarative, installable marketplace listing (vault 42 - Contratos/
    Marketplace Contract.md + Plugin Contract.md). Scoped v1 (confirmed with
    the user 2026-07-20): NO
     third-party code execution -- the vault's
    "Plugin Runtime executa em isolamento" would mean running untrusted code
    in a sandbox, a security undertaking out of proportion with every other
    gap closed this session. Instead, the only installable `kind` is
    "automation_template": a snapshot of an owned Automation's trigger/action
    config (see app/models/automation.py), which is already pure declarative
    data -- credentials are never embedded (only `{{credential:name}}`
    placeholders), so publishing and cloning it carries no more risk than
    copying a config file. `permissions` is derived deterministically from
    the source automation's trigger_type/action_type rather than
    author-declared free text, so it is genuinely "verificável" per the
    contract's acceptance criteria, not just claimed. `price_cents` is
    always 0 -- real paid listings need a payment integration, the same
    business decision that scoped platform billing down to Metering/
    Entitlements; there is no input field for it in the API."""

    __tablename__ = "marketplace_items"
    __table_args__ = (
        Index("idx_marketplace_item_author", "author_user_id"),
        Index("idx_marketplace_item_status", "status"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    author_user_id: Mapped[str] = mapped_column(String, nullable=False)
    kind: Mapped[str] = mapped_column(String, nullable=False, default="automation_template")
    source_automation_id: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    license: Mapped[str] = mapped_column(String, nullable=False, default="Proprietary")
    permissions_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    content_json: Mapped[str] = mapped_column(Text, nullable=False)
    content_hash: Mapped[str] = mapped_column(String, nullable=False)
    changelog_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    status: Mapped[str] = mapped_column(String, nullable=False, default="draft")
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)


class MarketplaceInstall(Base):
    """One install of a MarketplaceItem, recorded so uninstall is real and
    reversible (contract: "Instalação pode ser revertida" / "Desinstalação e
    rollback preservam o projeto") -- uninstall archives the cloned
    Automation rather than deleting it, matching automation_service.archive()
    semantics elsewhere in this codebase."""

    __tablename__ = "marketplace_installs"
    __table_args__ = (
        Index("idx_marketplace_install_installer", "installer_user_id"),
        Index("idx_marketplace_install_item", "item_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    item_id: Mapped[str] = mapped_column(String, nullable=False)
    item_version: Mapped[int] = mapped_column(Integer, nullable=False)
    installer_user_id: Mapped[str] = mapped_column(String, nullable=False)
    installed_automation_id: Mapped[str] = mapped_column(String, nullable=False)
    installed_at: Mapped[str] = mapped_column(String, nullable=False)
    uninstalled_at: Mapped[str | None] = mapped_column(String, nullable=True)