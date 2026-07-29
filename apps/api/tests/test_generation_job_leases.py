from __future__ import annotations

import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import update

from app.core.database import Base, get_engine
from app.engines.generation_job_engine import TERMINAL_STATUSES
from app.models.persistence import GenerationJob
from app.repositories.generation_job_repository import GenerationJobRepository


@pytest.fixture
def repository():
    root = Path("C:/tmp") / f"ldcn-lease-{uuid4().hex}"
    root.mkdir(parents=True)
    database = root / "jobs.db"
    repo = GenerationJobRepository(database)
    Base.metadata.create_all(bind=get_engine(repo.database_url))
    try:
        yield repo
    finally:
        get_engine(repo.database_url).dispose()
        shutil.rmtree(root, ignore_errors=True)


def _create(repository: GenerationJobRepository, job_id: str = "job-1") -> None:
    now = datetime.now(UTC).replace(microsecond=0).isoformat()
    repository.create(
        "owner-1",
        {
            "id": job_id,
            "projectId": "project-1",
            "status": "QUEUED",
            "currentStage": "QUEUED",
            "createdAt": now,
            "updatedAt": now,
        },
        {},
        {},
    )


def test_only_one_worker_can_claim_and_heartbeat(repository):
    _create(repository)
    attempt = repository.claim("job-1", "owner-1", "worker-a", lease_seconds=120)
    assert attempt is not None
    assert repository.claim("job-1", "owner-1", "worker-b", lease_seconds=120) is None
    assert repository.heartbeat("job-1", "worker-a", attempt, lease_seconds=120) is True

    job = repository.get("job-1", "owner-1")
    assert job is not None
    assert job["attemptId"] == attempt
    assert job["attemptCount"] == 1
    assert job["heartbeatAt"] is not None

    assert repository.release_lease("job-1", "worker-a", attempt) is True
    assert repository.claim("job-1", "owner-1", "worker-b", lease_seconds=120) is not None


def test_expired_inflight_job_becomes_recoverable_stalled(repository):
    _create(repository)
    attempt = repository.claim("job-1", "owner-1", "worker-dead", lease_seconds=120)
    assert attempt is not None
    expired = (datetime.now(UTC) - timedelta(minutes=5)).isoformat()
    with repository._sessions.begin() as session:
        session.execute(
            update(GenerationJob)
            .where(GenerationJob.id == "job-1")
            .values(status="BACKEND_RUNNING", lease_expires_at=expired)
        )

    assert repository.reconcile_expired(TERMINAL_STATUSES) == 1
    job = repository.get("job-1", "owner-1")
    assert job is not None
    assert job["status"] == "STALLED"
    assert job["error"]["kind"] == "worker_lease_expired"
    assert job["leaseExpiresAt"] is None


def test_queued_without_lease_is_dispatchable(repository):
    _create(repository)
    assert repository.queued_without_lease() == [("job-1", "owner-1")]
    repository.claim("job-1", "owner-1", "worker-a", lease_seconds=120)
    assert repository.queued_without_lease() == []


def test_token_budget_reservation_is_atomic_and_settled(repository):
    _create(repository)
    assert repository.reserve_tokens("job-1", "owner-1", 600_000, daily_limit=700_000) is True
    assert repository.reserve_tokens("job-1", "owner-1", 250_000, daily_limit=700_000) is False
    job = repository.get("job-1", "owner-1")
    assert job is not None and job["reservedTokens"] == 600_000
    totals = repository.settle_reserved_usage("job-1", "owner-1", 600_000, 10_000, 20_000)
    assert totals == (10_000, 20_000)
    job = repository.get("job-1", "owner-1")
    assert job is not None and job["reservedTokens"] == 0


def test_daily_budget_includes_other_open_reservations(repository):
    _create(repository, "job-1")
    _create(repository, "job-2")
    assert repository.reserve_tokens("job-1", "owner-1", 500_000, daily_limit=700_000) is True
    assert repository.reserve_tokens("job-2", "owner-1", 250_000, daily_limit=700_000) is False