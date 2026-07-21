from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import func, select

from app.core.database import database_url_for, session_factory
from app.models.marketplace import MarketplaceInstall, MarketplaceItem


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _content_hash(content: dict[str, Any]) -> str:
    canonical = json.dumps(content, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class MarketplaceRepository:
    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self._sessions = session_factory(self.database_url)

    # -------------------------------------------------------------- Items
    def create_item(
        self, *, author_user_id: str, kind: str = "automation_template", source_automation_id: str,
        name: str, description: str, license: str, permissions: list[str], content: dict[str, Any],
    ) -> dict[str, Any]:
        now = _now()
        row = MarketplaceItem(
            id=f"mkt_{uuid4().hex[:12]}", author_user_id=author_user_id, kind=kind,
            source_automation_id=source_automation_id, name=name, description=description, license=license,
            permissions_json=json.dumps(permissions, ensure_ascii=False), price_cents=0, version=1,
            content_json=json.dumps(content, ensure_ascii=False), content_hash=_content_hash(content),
            changelog_json=json.dumps([{"version": 1, "note": "Publicação inicial.", "published_at": now}], ensure_ascii=False),
            status="draft", created_at=now, updated_at=now,
        )
        with self._sessions.begin() as session:
            session.add(row)
        return self._as_dict(row)

    def get_item(self, item_id: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            row = session.get(MarketplaceItem, item_id)
            return self._as_dict(row) if row is not None else None

    def list_published(self, *, search: str | None = None) -> list[dict[str, Any]]:
        with self._sessions() as session:
            rows = session.scalars(
                select(MarketplaceItem).where(MarketplaceItem.status == "published")
                .order_by(MarketplaceItem.updated_at.desc())
            ).all()
        items = [self._as_dict(row) for row in rows]
        if search:
            query = search.strip().lower()
            items = [item for item in items if query in item["name"].lower() or query in item["description"].lower()]
        return items

    def list_for_author(self, author_user_id: str) -> list[dict[str, Any]]:
        with self._sessions() as session:
            rows = session.scalars(
                select(MarketplaceItem).where(MarketplaceItem.author_user_id == author_user_id)
                .order_by(MarketplaceItem.updated_at.desc())
            ).all()
        return [self._as_dict(row) for row in rows]

    def set_status(self, item_id: str, author_user_id: str, status: str) -> dict[str, Any] | None:
        with self._sessions.begin() as session:
            row = session.get(MarketplaceItem, item_id)
            if row is None or row.author_user_id != author_user_id:
                return None
            row.status = status
            row.updated_at = _now()
            session.flush()
            return self._as_dict(row)

    def update_content(self, item_id: str, author_user_id: str, *, content: dict[str, Any], note: str) -> dict[str, Any] | None:
        with self._sessions.begin() as session:
            row = session.get(MarketplaceItem, item_id)
            if row is None or row.author_user_id != author_user_id:
                return None
            now = _now()
            row.version += 1
            row.content_json = json.dumps(content, ensure_ascii=False)
            row.content_hash = _content_hash(content)
            changelog = json.loads(row.changelog_json or "[]")
            changelog.append({"version": row.version, "note": note, "published_at": now})
            row.changelog_json = json.dumps(changelog, ensure_ascii=False)
            row.updated_at = now
            session.flush()
            return self._as_dict(row)

    def get_items_by_ids(self, item_ids: list[str]) -> dict[str, dict[str, Any]]:
        if not item_ids:
            return {}
        with self._sessions() as session:
            rows = session.scalars(select(MarketplaceItem).where(MarketplaceItem.id.in_(item_ids))).all()
        return {row.id: self._as_dict(row) for row in rows}

    @staticmethod
    def _as_dict(row: MarketplaceItem) -> dict[str, Any]:
        return {
            "id": row.id, "author_user_id": row.author_user_id, "kind": row.kind,
            "source_automation_id": row.source_automation_id, "name": row.name, "description": row.description,
            "license": row.license, "permissions": json.loads(row.permissions_json or "[]"),
            "price_cents": row.price_cents, "version": row.version, "content": json.loads(row.content_json),
            "content_hash": row.content_hash, "changelog": json.loads(row.changelog_json or "[]"),
            "status": row.status, "created_at": row.created_at, "updated_at": row.updated_at,
        }

    # ----------------------------------------------------------- Installs
    def create_install(self, *, item_id: str, item_version: int, installer_user_id: str, installed_automation_id: str) -> dict[str, Any]:
        row = MarketplaceInstall(
            id=f"mktinstall_{uuid4().hex[:12]}", item_id=item_id, item_version=item_version,
            installer_user_id=installer_user_id, installed_automation_id=installed_automation_id,
            installed_at=_now(), uninstalled_at=None,
        )
        with self._sessions.begin() as session:
            session.add(row)
        return self._install_as_dict(row)

    def get_install(self, install_id: str, installer_user_id: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            row = session.get(MarketplaceInstall, install_id)
            if row is None or row.installer_user_id != installer_user_id:
                return None
            return self._install_as_dict(row)

    def list_installs_for_user(self, installer_user_id: str) -> list[dict[str, Any]]:
        with self._sessions() as session:
            rows = session.scalars(
                select(MarketplaceInstall).where(MarketplaceInstall.installer_user_id == installer_user_id)
                .order_by(MarketplaceInstall.installed_at.desc())
            ).all()
        return [self._install_as_dict(row) for row in rows]

    def count_installs_for_items(self, item_ids: list[str]) -> dict[str, int]:
        """Cumulative download count -- never filters out uninstalled rows,
        since "downloads" (like npm/VSCode Marketplace) is a counter that
        never decrements when something is later removed."""
        if not item_ids:
            return {}
        with self._sessions() as session:
            rows = session.execute(
                select(MarketplaceInstall.item_id, func.count(MarketplaceInstall.id))
                .where(MarketplaceInstall.item_id.in_(item_ids))
                .group_by(MarketplaceInstall.item_id)
            ).all()
        return dict(rows)

    def mark_uninstalled(self, install_id: str, installer_user_id: str) -> dict[str, Any] | None:
        with self._sessions.begin() as session:
            row = session.get(MarketplaceInstall, install_id)
            if row is None or row.installer_user_id != installer_user_id:
                return None
            row.uninstalled_at = _now()
            session.flush()
            return self._install_as_dict(row)

    @staticmethod
    def _install_as_dict(row: MarketplaceInstall) -> dict[str, Any]:
        return {
            "id": row.id, "item_id": row.item_id, "item_version": row.item_version,
            "installed_automation_id": row.installed_automation_id,
            "installed_at": row.installed_at, "uninstalled_at": row.uninstalled_at,
        }
