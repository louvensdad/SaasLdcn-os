from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.core.database import database_url_for, session_factory
from app.models.evolution_signal import EvolutionSignal


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class EvolutionSignalRepository:
    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self._sessions = session_factory(self.database_url)

    def record(
        self, *, owner_user_id: str, stack_signature: str, model_strategy: str | None,
        delivery_type: str, outcome: str, completeness_status: str | None, repair_cycles: int,
    ) -> None:
        with self._sessions.begin() as session:
            session.add(
                EvolutionSignal(
                    id=f"evosig_{uuid4().hex[:12]}", owner_user_id=owner_user_id, stack_signature=stack_signature,
                    model_strategy=model_strategy, delivery_type=delivery_type, outcome=outcome,
                    completeness_status=completeness_status, repair_cycles=repair_cycles, created_at=_now(),
                )
            )

    def list_for_owner_and_stack(self, owner_user_id: str, stack_signature: str, *, limit: int = 200) -> list[dict[str, Any]]:
        with self._sessions() as session:
            rows = session.scalars(
                select(EvolutionSignal)
                .where(EvolutionSignal.owner_user_id == owner_user_id, EvolutionSignal.stack_signature == stack_signature)
                .order_by(EvolutionSignal.created_at.desc())
                .limit(limit)
            ).all()
        return [
            {
                "outcome": row.outcome, "completeness_status": row.completeness_status,
                "repair_cycles": row.repair_cycles, "model_strategy": row.model_strategy,
                "created_at": row.created_at,
            }
            for row in rows
        ]
