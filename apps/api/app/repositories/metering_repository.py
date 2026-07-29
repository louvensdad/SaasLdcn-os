from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import func, select

from app.core.database import database_url_for, session_factory
from app.models.metering import MeteringRecord, ResourceEntitlement


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def current_period_start() -> str:
    """Calendar month in UTC -- the only "billing period" concept honest to
    build without a real subscription/contract entity to anchor a cycle to."""
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()


class MeteringRepository:
    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self._sessions = session_factory(self.database_url)

    def record(self, *, owner_user_id: str, resource_type: str, quantity: float, unit: str, origin: str) -> None:
        with self._sessions.begin() as session:
            session.add(
                MeteringRecord(
                    id=f"meter_{uuid4().hex[:12]}", owner_user_id=owner_user_id, resource_type=resource_type,
                    quantity=quantity, unit=unit, origin=origin, occurred_at=_now(),
                )
            )

    def sum_for_owner(self, owner_user_id: str, resource_type: str, *, since: str) -> float:
        with self._sessions() as session:
            total = session.scalar(
                select(func.sum(MeteringRecord.quantity)).where(
                    MeteringRecord.owner_user_id == owner_user_id, MeteringRecord.resource_type == resource_type,
                    MeteringRecord.occurred_at >= since,
                )
            )
        return float(total or 0.0)

    def summary_for_owner(self, owner_user_id: str, *, since: str) -> list[dict[str, Any]]:
        with self._sessions() as session:
            rows = session.execute(
                select(MeteringRecord.resource_type, func.sum(MeteringRecord.quantity), func.max(MeteringRecord.unit))
                .where(MeteringRecord.owner_user_id == owner_user_id, MeteringRecord.occurred_at >= since)
                .group_by(MeteringRecord.resource_type)
            ).all()
        return [{"resource_type": row[0], "quantity": float(row[1] or 0.0), "unit": row[2]} for row in rows]

    # ------------------------------------------------------------ entitlements
    def get_limit(self, owner_user_id: str, resource_type: str) -> float | None:
        with self._sessions() as session:
            row = session.get(ResourceEntitlement, (owner_user_id, resource_type))
            return row.monthly_limit if row is not None else None

    def list_limits(self, owner_user_id: str) -> list[dict[str, Any]]:
        with self._sessions() as session:
            rows = session.scalars(
                select(ResourceEntitlement).where(ResourceEntitlement.owner_user_id == owner_user_id)
            ).all()
        return [
            {"owner_user_id": r.owner_user_id, "resource_type": r.resource_type, "monthly_limit": r.monthly_limit, "updated_at": r.updated_at}
            for r in rows
        ]

    def set_limit(self, owner_user_id: str, resource_type: str, monthly_limit: float, *, updated_by_user_id: str) -> dict[str, Any]:
        now = _now()
        with self._sessions.begin() as session:
            row = session.get(ResourceEntitlement, (owner_user_id, resource_type))
            if row is None:
                row = ResourceEntitlement(
                    owner_user_id=owner_user_id, resource_type=resource_type, monthly_limit=monthly_limit,
                    updated_by_user_id=updated_by_user_id, updated_at=now,
                )
                session.add(row)
            else:
                row.monthly_limit = monthly_limit
                row.updated_by_user_id = updated_by_user_id
                row.updated_at = now
            session.flush()
            return {"owner_user_id": row.owner_user_id, "resource_type": row.resource_type, "monthly_limit": row.monthly_limit, "updated_at": row.updated_at}
