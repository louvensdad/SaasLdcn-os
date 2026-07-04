from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from collections.abc import Sequence

from sqlalchemy import delete, func, or_, select, update

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
                data_json=self._dump(data),
                spec_json=self._dump(spec),
                blueprint_json=self._dump(blueprint),
                created_at=data["createdAt"],
                updated_at=data["updatedAt"],
                input_tokens_total=0,
                output_tokens_total=0,
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

    def list(self, owner_user_id: str) -> list[dict[str, Any]]:
        with self._sessions() as session:
            rows = session.scalars(select(GenerationJob).where(self._visible_to(owner_user_id)).order_by(GenerationJob.updated_at.desc())).all()
            return [self._row(row) for row in rows if row is not None]

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

    def add_usage(self, job_id: str, owner_user_id: str, input_tokens: int = 0, output_tokens: int = 0) -> tuple[int, int] | None:
        """Atomically accumulate provider usage and return the persisted totals."""
        input_tokens = max(0, int(input_tokens or 0))
        output_tokens = max(0, int(output_tokens or 0))
        with self._sessions.begin() as session:
            result = session.execute(
                update(GenerationJob)
                .where(GenerationJob.id == job_id, self._writable_by(owner_user_id))
                .values(
                    input_tokens_total=GenerationJob.input_tokens_total + input_tokens,
                    output_tokens_total=GenerationJob.output_tokens_total + output_tokens,
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
