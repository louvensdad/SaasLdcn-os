from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.core.database import database_url_for, session_factory
from app.models.platform_runtime_config import PlatformRuntimeConfig

_SINGLETON_ID = "singleton"


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class PlatformRuntimeConfigRepository:
    """Single-row table backing the platform-wide runtime knobs (worker pool
    size, generation job lease, audit log retention). These are shared
    process-global resources, not per-user preferences -- see
    app/services/platform_runtime_config_service.py for how a change here
    is applied live in the running process."""

    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self._sessions = session_factory(self.database_url)

    def get(self) -> dict[str, Any] | None:
        with self._sessions() as session:
            model = session.get(PlatformRuntimeConfig, _SINGLETON_ID)
            if model is None:
                return None
            return {
                "agent_worker_limit": model.agent_worker_limit,
                "generation_job_lease_seconds": model.generation_job_lease_seconds,
                "audit_log_retention_days": model.audit_log_retention_days,
            }

    def set(self, column: str, value: int) -> None:
        insert = sqlite_insert if self.database_url.startswith("sqlite") else postgresql_insert
        now = _now()
        with self._sessions.begin() as session:
            stmt = insert(PlatformRuntimeConfig).values(
                id=_SINGLETON_ID, **{column: value}, updated_at=now
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[PlatformRuntimeConfig.id],
                set_={column: value, "updated_at": now},
            )
            session.execute(stmt)
