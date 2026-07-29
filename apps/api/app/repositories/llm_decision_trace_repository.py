from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.core.database import database_url_for, session_factory
from app.core.logging import logger
from app.models.llm_decision_trace import LlmDecisionTrace
from app.repositories.llm_usage_repository import estimate_cost_usd


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class LlmDecisionTraceRepository:
    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self._sessions = session_factory(self.database_url)

    def record(
        self,
        *,
        provider: str,
        model: str,
        agent_role: str | None,
        model_strategy: str | None,
        selection_policy: str,
        alternatives: list[dict[str, str]],
        context_used: list[str] | None,
        project_id: str | None,
        usage: dict,
        latency_ms: int,
    ) -> None:
        input_tokens = int(usage.get("input", 0) or 0)
        output_tokens = int(usage.get("output", 0) or 0)
        with self._sessions.begin() as session:
            session.add(
                LlmDecisionTrace(
                    id=f"llmdec_{uuid4().hex[:12]}",
                    provider=provider,
                    model=model,
                    agent_role=agent_role,
                    model_strategy=model_strategy,
                    selection_policy=selection_policy,
                    alternatives_json=json.dumps(alternatives, ensure_ascii=False),
                    context_used_json=json.dumps(context_used or [], ensure_ascii=False),
                    project_id=project_id,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    latency_ms=latency_ms,
                    estimated_cost_usd=estimate_cost_usd(model, input_tokens, output_tokens),
                    created_at=_now(),
                )
            )

    @staticmethod
    def _as_dict(row: LlmDecisionTrace) -> dict[str, Any]:
        return {
            "id": row.id,
            "provider": row.provider,
            "model": row.model,
            "agent_role": row.agent_role,
            "model_strategy": row.model_strategy,
            "selection_policy": row.selection_policy,
            "alternatives": json.loads(row.alternatives_json or "[]"),
            "context_used": json.loads(row.context_used_json or "[]"),
            "project_id": row.project_id,
            "input_tokens": row.input_tokens,
            "output_tokens": row.output_tokens,
            "latency_ms": row.latency_ms,
            "estimated_cost_usd": row.estimated_cost_usd,
            "created_at": row.created_at,
        }

    def get(self, trace_id: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            row = session.get(LlmDecisionTrace, trace_id)
            return self._as_dict(row) if row is not None else None

    def list_for_project(self, project_id: str, *, limit: int = 100) -> list[dict[str, Any]]:
        with self._sessions() as session:
            rows = session.scalars(
                select(LlmDecisionTrace)
                .where(LlmDecisionTrace.project_id == project_id)
                .order_by(LlmDecisionTrace.created_at.desc())
                .limit(limit)
            ).all()
        return [self._as_dict(row) for row in rows]


def record_decision_safely(
    *,
    provider: str,
    model: str,
    agent_role: str | None,
    model_strategy: str | None,
    selection_policy: str,
    alternatives: list[dict[str, str]],
    context_used: list[str] | None,
    project_id: str | None,
    usage: dict,
    latency_ms: int,
) -> None:
    """Fault-isolated single entry point used by the router: telemetry must
    never break (or slow-fail) a real generation call -- same guarantee as
    llm_usage_repository.record_usage_safely."""
    try:
        LlmDecisionTraceRepository().record(
            provider=provider, model=model, agent_role=agent_role, model_strategy=model_strategy,
            selection_policy=selection_policy, alternatives=alternatives, context_used=context_used,
            project_id=project_id, usage=usage, latency_ms=latency_ms,
        )
    except Exception as exc:  # noqa: BLE001 -- deliberate isolation boundary
        logger.warning("llm decision trace telemetry failed (ignored): %s", exc)
