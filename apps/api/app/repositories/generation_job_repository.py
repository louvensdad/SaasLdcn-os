from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4
from typing import Any

from collections.abc import Sequence

from sqlalchemy import Integer, case, cast, delete, func, or_, select, update

from app.core.config import get_settings
from app.core.database import database_url_for, session_factory
from app.models.persistence import GenerationJob
from app.models.tenant import WorkspaceMembership
from app.repositories.tenant_repository import WORKSPACE_WRITE_ROLES


class GenerationJobRepository:
    def __init__(self, database: str | Path | None = None) -> None:
        self.database_url = database_url_for(database)
        self.sqlite_path = database if isinstance(database, Path) else get_settings().sqlite_path
        self._sessions = session_factory(self.database_url)

    @staticmethod
    def _visible_to(user_id: str):
        """Owner OR any workspace membership (read access, includes viewers) --
        mirrors project_repository.py's read scope."""
        member_workspaces = select(WorkspaceMembership.workspace_id).where(WorkspaceMembership.user_id == user_id)
        return or_(GenerationJob.owner_user_id == user_id, GenerationJob.workspace_id.in_(member_workspaces))

    @staticmethod
    def _writable_by(user_id: str):
        """Owner OR workspace membership with a write role (excludes viewer) --
        mirrors project_repository.py's update/delete scope."""
        member_workspaces = select(WorkspaceMembership.workspace_id).where(
            WorkspaceMembership.user_id == user_id,
            WorkspaceMembership.role.in_(tuple(WORKSPACE_WRITE_ROLES)),
        )
        return or_(GenerationJob.owner_user_id == user_id, GenerationJob.workspace_id.in_(member_workspaces))

    def create(self, owner_user_id: str, data: dict[str, Any], spec: dict[str, Any], blueprint: dict[str, Any]) -> dict[str, Any]:
        normalized = self._normalized(data)
        workspace_id = normalized.get("workspace_id")
        with self._sessions.begin() as session:
            if workspace_id is not None and session.get(WorkspaceMembership, (workspace_id, owner_user_id)) is None:
                # Defense in depth: the route layer already validates workspace
                # membership before reaching here, but this keeps the repository
                # correct for any future caller that doesn't.
                raise PermissionError(f"User is not a member of workspace {workspace_id!r}.")
            session.add(GenerationJob(
                id=data["id"],
                owner_user_id=owner_user_id,
                project_id=data["projectId"],
                source_mission_id=data.get("sourceMissionId"),
                data_json=self._dump(data),
                spec_json=self._dump(spec),
                blueprint_json=self._dump(blueprint),
                created_at=data["createdAt"],
                updated_at=data["updatedAt"],
                input_tokens_total=0,
                output_tokens_total=0,
                token_budget=get_settings().generation_job_token_budget,
                **normalized,
            ))
        return data

    def get(self, job_id: str, owner_user_id: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            row = session.scalar(select(GenerationJob).where(GenerationJob.id == job_id, self._visible_to(owner_user_id)))
            return self._row(row)

    def latest_for_project(self, project_id: str, owner_user_id: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            row = session.scalar(select(GenerationJob).where(GenerationJob.project_id == project_id, self._visible_to(owner_user_id)).order_by(GenerationJob.updated_at.desc()).limit(1))
            return self._row(row)

    def latest_for_generated_project(self, generated_project_id: str, owner_user_id: str) -> dict[str, Any] | None:
        """Reverse lookup: which job produced this output-folder id. No column
        indexes generatedProjectId (it's only set inside data_json once the job
        actually writes output, generation_job_engine.py's BUILD_RUNNING step) --
        this scans the owner's jobs the same way list()/count_active_for_owner
        already do and filters in Python. Used by the Engineering Kernel to enrich
        a bare generated_project_id with its originating job's in-flight status."""
        with self._sessions() as session:
            rows = session.scalars(
                select(GenerationJob).where(self._visible_to(owner_user_id)).order_by(GenerationJob.updated_at.desc())
            ).all()
            for row in rows:
                data = self._row(row)
                if data and data.get("generatedProjectId") == generated_project_id:
                    return data
        return None

    def find_active_by_source_mission(
        self, mission_id: str, owner_user_id: str, *, terminal_statuses: Sequence[str]
    ) -> dict[str, Any] | None:
        """Idempotency check for MissionExecutionHandoffService.start_generation:
        is there already an in-flight job for this mission? Uses the indexed
        source_mission_id column (not a data_json scan) since this is queried
        on every start-generation call."""
        with self._sessions() as session:
            row = session.scalar(
                select(GenerationJob)
                .where(
                    GenerationJob.source_mission_id == mission_id,
                    GenerationJob.status.notin_(list(terminal_statuses)),
                    self._visible_to(owner_user_id),
                )
                .order_by(GenerationJob.updated_at.desc())
                .limit(1)
            )
            return self._row(row)

    def list(self, owner_user_id: str, *, archived: bool | None = None) -> list[dict[str, Any]]:
        with self._sessions() as session:
            stmt = select(GenerationJob).where(self._visible_to(owner_user_id))
            if archived is not None:
                stmt = stmt.where(GenerationJob.archived == archived)
            rows = session.scalars(stmt.order_by(GenerationJob.updated_at.desc())).all()
            return [self._row(row) for row in rows if row is not None]

    def set_archived(self, job_id: str, owner_user_id: str, archived: bool) -> dict[str, Any] | None:
        with self._sessions.begin() as session:
            result = session.execute(
                update(GenerationJob).where(GenerationJob.id == job_id, self._writable_by(owner_user_id)).values(archived=archived)
            )
            if not result.rowcount:
                return None
        return self.get(job_id, owner_user_id)

    def count_active_for_owner(self, owner_user_id: str, terminal_statuses: Sequence[str]) -> int:
        """Number of the owner's jobs that are NOT in a terminal status — i.e. in
        flight (QUEUED or any *_RUNNING/*_GENERATING stage). Uses the
        (owner_user_id, status) index. Used to cap concurrent generations."""
        with self._sessions() as session:
            count = session.scalar(
                select(func.count())
                .select_from(GenerationJob)
                .where(
                    GenerationJob.owner_user_id == owner_user_id,
                    GenerationJob.status.notin_(list(terminal_statuses)),
                )
            )
            return int(count or 0)

    def claim(
        self, job_id: str, owner_user_id: str, worker_id: str, *, lease_seconds: int
    ) -> str | None:
        """Atomically acquire an execution lease. Only one instance can win."""
        now = datetime.now(UTC).replace(microsecond=0)
        now_text = now.isoformat()
        expires = (now + timedelta(seconds=max(30, lease_seconds))).isoformat()
        attempt_id = f"attempt_{uuid4().hex[:16]}"
        with self._sessions.begin() as session:
            result = session.execute(
                update(GenerationJob)
                .where(
                    GenerationJob.id == job_id,
                    GenerationJob.owner_user_id == owner_user_id,
                    or_(
                        GenerationJob.lease_expires_at.is_(None),
                        GenerationJob.lease_expires_at < now_text,
                        GenerationJob.lease_owner == worker_id,
                    ),
                )
                .values(
                    attempt_id=attempt_id,
                    lease_owner=worker_id,
                    lease_expires_at=expires,
                    heartbeat_at=now_text,
                    attempt_count=GenerationJob.attempt_count + 1,
                )
            )
            return attempt_id if result.rowcount else None

    def heartbeat(self, job_id: str, worker_id: str, attempt_id: str, *, lease_seconds: int) -> bool:
        now = datetime.now(UTC).replace(microsecond=0)
        with self._sessions.begin() as session:
            result = session.execute(
                update(GenerationJob)
                .where(
                    GenerationJob.id == job_id,
                    GenerationJob.lease_owner == worker_id,
                    GenerationJob.attempt_id == attempt_id,
                )
                .values(
                    heartbeat_at=now.isoformat(),
                    lease_expires_at=(now + timedelta(seconds=max(30, lease_seconds))).isoformat(),
                )
            )
            return bool(result.rowcount)

    def release_lease(self, job_id: str, worker_id: str, attempt_id: str) -> bool:
        with self._sessions.begin() as session:
            result = session.execute(
                update(GenerationJob)
                .where(
                    GenerationJob.id == job_id,
                    GenerationJob.lease_owner == worker_id,
                    GenerationJob.attempt_id == attempt_id,
                )
                .values(lease_owner=None, lease_expires_at=None, heartbeat_at=None)
            )
            return bool(result.rowcount)

    def reconcile_expired(self, terminal_statuses: Sequence[str]) -> int:
        """Convert abandoned in-flight attempts to recoverable STALLED jobs."""
        now = datetime.now(UTC).replace(microsecond=0).isoformat()
        diagnostic = self._dump({
            "kind": "worker_lease_expired",
            "message": "Generation worker lease expired; execution can be resumed safely.",
            "recommended_action": "Resume the stalled stage after reviewing its last checkpoint.",
        })
        with self._sessions.begin() as session:
            result = session.execute(
                update(GenerationJob)
                .where(
                    GenerationJob.status.notin_(list(terminal_statuses)),
                    GenerationJob.lease_expires_at.is_not(None),
                    GenerationJob.lease_expires_at < now,
                )
                .values(
                    status="STALLED",
                    error=diagnostic,
                    completed_at=now,
                    lease_owner=None,
                    lease_expires_at=None,
                    heartbeat_at=None,
                )
            )
            return int(result.rowcount or 0)

    def queued_without_lease(self) -> list[tuple[str, str]]:
        with self._sessions() as session:
            return [
                (str(row[0]), str(row[1]))
                for row in session.execute(
                    select(GenerationJob.id, GenerationJob.owner_user_id).where(
                        GenerationJob.status == "QUEUED",
                        GenerationJob.lease_owner.is_(None),
                    )
                ).all()
            ]
    def delete(self, job_id: str, owner_user_id: str) -> bool:
        with self._sessions.begin() as session:
            result = session.execute(delete(GenerationJob).where(GenerationJob.id == job_id, self._writable_by(owner_user_id)))
            return bool(result.rowcount)

    def update(self, job_id: str, owner_user_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
        values = {
            "data_json": self._dump(data),
            "updated_at": data["updatedAt"],
            **self._normalized(data),
        }
        with self._sessions.begin() as session:
            result = session.execute(update(GenerationJob).where(GenerationJob.id == job_id, self._writable_by(owner_user_id)).values(**values))
            if not result.rowcount:
                return None
        return self.get(job_id, owner_user_id)

    def reserve_tokens(
        self, job_id: str, owner_user_id: str, requested_tokens: int, *, daily_limit: int
    ) -> bool:
        requested = max(1, int(requested_tokens))
        day_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        with self._sessions.begin() as session:
            session.execute(
                select(GenerationJob.id)
                .where(GenerationJob.owner_user_id == owner_user_id)
                .with_for_update()
            ).all()
            daily = session.execute(
                select(
                    func.coalesce(func.sum(GenerationJob.input_tokens_total), 0),
                    func.coalesce(func.sum(GenerationJob.output_tokens_total), 0),
                    func.coalesce(func.sum(GenerationJob.reserved_tokens), 0),
                ).where(
                    GenerationJob.owner_user_id == owner_user_id,
                    GenerationJob.created_at >= day_start,
                )
            ).one()
            if sum(int(value or 0) for value in daily) + requested > max(1, int(daily_limit)):
                return False
            result = session.execute(
                update(GenerationJob)
                .where(
                    GenerationJob.id == job_id,
                    GenerationJob.owner_user_id == owner_user_id,
                    func.coalesce(GenerationJob.input_tokens_total, 0) + func.coalesce(GenerationJob.output_tokens_total, 0)
                    + func.coalesce(GenerationJob.reserved_tokens, 0) + requested <= func.coalesce(GenerationJob.token_budget, 0),
                )
                .values(reserved_tokens=func.coalesce(GenerationJob.reserved_tokens, 0) + requested)
            )
            return bool(result.rowcount)

    def settle_reserved_usage(
        self, job_id: str, owner_user_id: str, reserved_tokens: int,
        input_tokens: int = 0, output_tokens: int = 0,
    ) -> tuple[int, int] | None:
        reserved = max(0, int(reserved_tokens))
        input_tokens = max(0, int(input_tokens or 0))
        output_tokens = max(0, int(output_tokens or 0))
        with self._sessions.begin() as session:
            # PostgreSQL has no scalar two-argument MAX(a, b) (only the aggregate
            # MAX(column) form -- func.max(x, y) crashed with UndefinedFunction in
            # production). SQLite's MAX() happens to accept both forms, which is why
            # that bug shipped unnoticed against the SQLite-backed dev/test default.
            # A CASE expression is standard SQL and floors the release at zero on
            # every dialect this app runs against, without a dialect-specific
            # GREATEST() call (Postgres has one; SQLite as bundled here does not).
            remaining_reserved = func.coalesce(GenerationJob.reserved_tokens, 0) - reserved
            result = session.execute(
                update(GenerationJob)
                .where(GenerationJob.id == job_id, GenerationJob.owner_user_id == owner_user_id)
                .values(
                    reserved_tokens=case(
                        (remaining_reserved > 0, remaining_reserved),
                        else_=cast(0, Integer),
                    ),
                    input_tokens_total=func.coalesce(GenerationJob.input_tokens_total, 0) + input_tokens,
                    output_tokens_total=func.coalesce(GenerationJob.output_tokens_total, 0) + output_tokens,
                )
            )
            if not result.rowcount:
                return None
            totals = session.execute(
                select(GenerationJob.input_tokens_total, GenerationJob.output_tokens_total)
                .where(GenerationJob.id == job_id)
            ).one()
            return int(totals[0]), int(totals[1])
    def add_usage(self, job_id: str, owner_user_id: str, input_tokens: int = 0, output_tokens: int = 0) -> tuple[int, int] | None:
        """Atomically accumulate provider usage and return the persisted totals."""
        input_tokens = max(0, int(input_tokens or 0))
        output_tokens = max(0, int(output_tokens or 0))
        with self._sessions.begin() as session:
            result = session.execute(
                update(GenerationJob)
                .where(GenerationJob.id == job_id, self._writable_by(owner_user_id))
                .values(
                    input_tokens_total=func.coalesce(GenerationJob.input_tokens_total, 0) + input_tokens,
                    output_tokens_total=func.coalesce(GenerationJob.output_tokens_total, 0) + output_tokens,
                )
            )
            if not result.rowcount:
                return None
            totals = session.execute(
                select(GenerationJob.input_tokens_total, GenerationJob.output_tokens_total)
                .where(GenerationJob.id == job_id, self._writable_by(owner_user_id))
            ).one()
            return int(totals[0]), int(totals[1])

    def usage_summary_for_owner(self, owner_user_id: str, since: str | None = None) -> dict[str, Any]:
        """Aggregate real, measured token usage for the owner across all jobs — the
        source of truth for per-user cost attribution / billing (audit B4/AI2). No
        estimate: totals come from the per-job usage accumulated during generation.
        `since` is an ISO-8601 UTC timestamp; created_at uses the same format so the
        lexicographic comparison is chronological."""
        totals_stmt = select(
            func.coalesce(func.sum(GenerationJob.input_tokens_total), 0),
            func.coalesce(func.sum(GenerationJob.output_tokens_total), 0),
            func.count(),
        ).where(GenerationJob.owner_user_id == owner_user_id)
        by_model_stmt = select(
            GenerationJob.model,
            func.coalesce(func.sum(GenerationJob.input_tokens_total), 0),
            func.coalesce(func.sum(GenerationJob.output_tokens_total), 0),
            func.count(),
        ).where(GenerationJob.owner_user_id == owner_user_id).group_by(GenerationJob.model)
        if since:
            totals_stmt = totals_stmt.where(GenerationJob.created_at >= since)
            by_model_stmt = by_model_stmt.where(GenerationJob.created_at >= since)

        with self._sessions() as session:
            total_in, total_out, job_count = session.execute(totals_stmt).one()
            model_rows = session.execute(by_model_stmt.order_by(func.count().desc())).all()

        return {
            "input_tokens": int(total_in or 0),
            "output_tokens": int(total_out or 0),
            "total_tokens": int(total_in or 0) + int(total_out or 0),
            "job_count": int(job_count or 0),
            "by_model": [
                {
                    "model": row[0],
                    "input_tokens": int(row[1] or 0),
                    "output_tokens": int(row[2] or 0),
                    "job_count": int(row[3] or 0),
                }
                for row in model_rows
            ],
        }

    def inputs(self, job_id: str, owner_user_id: str) -> tuple[dict[str, Any], dict[str, Any]] | None:
        with self._sessions() as session:
            row = session.execute(select(GenerationJob.spec_json, GenerationJob.blueprint_json).where(GenerationJob.id == job_id, self._visible_to(owner_user_id))).first()
            return (json.loads(row[0]), json.loads(row[1])) if row else None

    @classmethod
    def _row(cls, row: GenerationJob | None) -> dict[str, Any] | None:
        if row is None:
            return None
        data = json.loads(row.data_json)
        data["status"] = row.status
        data["workspaceId"] = row.workspace_id
        data["currentStage"] = row.stage or data.get("currentStage") or row.status
        data["model"] = row.model
        data["inputTokensTotal"] = int(row.input_tokens_total or 0)
        data["outputTokensTotal"] = int(row.output_tokens_total or 0)
        data["startedAt"] = row.started_at or data.get("startedAt")
        data["finishedAt"] = row.completed_at
        data["archived"] = bool(row.archived)
        data["attemptId"] = row.attempt_id
        data["attemptCount"] = int(row.attempt_count or 0)
        data["leaseExpiresAt"] = row.lease_expires_at
        data["heartbeatAt"] = row.heartbeat_at
        data["tokenBudget"] = int(row.token_budget or 0)
        data["reservedTokens"] = int(row.reserved_tokens or 0)
        if row.error:
            data["error"] = json.loads(row.error)
        if row.result_path:
            data["resultPath"] = row.result_path
        return data

    @classmethod
    def _normalized(cls, data: dict[str, Any]) -> dict[str, Any]:
        error = data.get("error")
        return {
            "status": str(data.get("status") or "QUEUED"),
            "workspace_id": data.get("workspaceId"),
            "stage": data.get("currentStage"),
            "model": data.get("model"),
            "error": cls._dump(error) if error is not None else None,
            "result_path": data.get("resultPath"),
            "started_at": data.get("startedAt"),
            "completed_at": data.get("finishedAt"),
        }

    @staticmethod
    def _dump(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False)
