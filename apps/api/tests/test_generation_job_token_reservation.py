"""Fast, always-on regression tests for token reservation/settlement
(reserve_tokens / settle_reserved_usage) against this app's SQLite dev/test
default. These exercise the real repository code path end-to-end and would
have caught the SQLite-vs-PostgreSQL portability regression introduced while
fixing the reported `func.max(a, b)` -> UndefinedFunction crash (an earlier
fix used func.greatest(), which SQLite as bundled here does not implement).

The dialect-specific PostgreSQL crash itself is covered by
test_generation_job_token_reservation_postgres.py (LDCN_TEST_POSTGRES_URL) --
SQLite alone would not catch that half of the bug, which is why both suites
exist."""
from __future__ import annotations

import shutil
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest

from app.core.database import Base, get_engine
from app.repositories.generation_job_repository import GenerationJobRepository


@pytest.fixture
def repo():
    root = Path("C:/tmp") / f"ldcn-token-reservation-{uuid4().hex}"
    root.mkdir(parents=True)
    database = root / "jobs.db"
    repository = GenerationJobRepository(database)
    Base.metadata.create_all(bind=get_engine(repository.database_url))
    try:
        yield repository
    finally:
        get_engine(repository.database_url).dispose()
        shutil.rmtree(root, ignore_errors=True)


def _create_job(repo: GenerationJobRepository, owner: str = "owner-1", job_id: str = "job-1") -> None:
    now = datetime.now(UTC).replace(microsecond=0).isoformat()
    repo.create(
        owner,
        {
            "id": job_id,
            "projectId": "project-1",
            "status": "CONTRACTS_PLANNING",
            "currentStage": "CONTRACTS_PLANNING",
            "createdAt": now,
            "updatedAt": now,
        },
        {},
        {},
    )


# (a) reservation greater than the amount released
def test_settle_reserved_greater_than_released(repo):
    _create_job(repo)
    assert repo.reserve_tokens("job-1", "owner-1", 1000, daily_limit=1_000_000)

    totals = repo.settle_reserved_usage("job-1", "owner-1", 400, input_tokens=100, output_tokens=50)

    assert totals == (100, 50)
    job = repo.get("job-1", "owner-1")
    assert job["reservedTokens"] == 600


# (b) reservation equal to the amount released
def test_settle_reserved_equal_to_released(repo):
    _create_job(repo)
    assert repo.reserve_tokens("job-1", "owner-1", 500, daily_limit=1_000_000)

    repo.settle_reserved_usage("job-1", "owner-1", 500, input_tokens=200, output_tokens=90)

    assert repo.get("job-1", "owner-1")["reservedTokens"] == 0


# (c) amount released greater than the reservation -- must clamp at 0, never negative
def test_settle_released_greater_than_reserved_clamps_to_zero(repo):
    _create_job(repo)
    assert repo.reserve_tokens("job-1", "owner-1", 300, daily_limit=1_000_000)

    totals = repo.settle_reserved_usage("job-1", "owner-1", 5000, input_tokens=10, output_tokens=5)

    assert totals == (10, 5)
    job = repo.get("job-1", "owner-1")
    assert job["reservedTokens"] == 0
    assert job["reservedTokens"] >= 0


# (f) concurrent settlement of the same generation job must not lose an update
def test_concurrent_settle_same_job_is_atomic(repo):
    _create_job(repo)
    assert repo.reserve_tokens("job-1", "owner-1", 1000, daily_limit=1_000_000)

    def _settle(reserved: int, input_tokens: int, output_tokens: int):
        return repo.settle_reserved_usage("job-1", "owner-1", reserved, input_tokens=input_tokens, output_tokens=output_tokens)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(_settle, 300, 100, 50), pool.submit(_settle, 300, 70, 30)]
        results = [future.result() for future in futures]

    assert all(result is not None for result in results)
    job = repo.get("job-1", "owner-1")
    assert job["reservedTokens"] == 400
    assert job["inputTokensTotal"] == 170
    assert job["outputTokensTotal"] == 80


# (g) provider fails before returning any usage -- reservation must still release
def test_settle_after_provider_failure_releases_full_reservation(repo):
    _create_job(repo)
    reserved_tokens = 800
    assert repo.reserve_tokens("job-1", "owner-1", reserved_tokens, daily_limit=1_000_000)

    try:
        raise RuntimeError("simulated provider failure before usage was returned")
    except RuntimeError:
        totals = repo.settle_reserved_usage("job-1", "owner-1", reserved_tokens)

    assert totals == (0, 0)
    assert repo.get("job-1", "owner-1")["reservedTokens"] == 0


# (h) releasing a reservation with zero tokens actually consumed
def test_settle_release_with_zero_tokens_consumed(repo):
    _create_job(repo)
    assert repo.reserve_tokens("job-1", "owner-1", 250, daily_limit=1_000_000)

    totals = repo.settle_reserved_usage("job-1", "owner-1", 250, input_tokens=0, output_tokens=0)

    assert totals == (0, 0)
    job = repo.get("job-1", "owner-1")
    assert job["reservedTokens"] == 0
    assert job["inputTokensTotal"] == 0
    assert job["outputTokensTotal"] == 0


# (i) reserved_tokens must never go negative across repeated over-releases
def test_reserved_tokens_never_negative_across_repeated_overrelease(repo):
    _create_job(repo)
    assert repo.reserve_tokens("job-1", "owner-1", 100, daily_limit=1_000_000)

    repo.settle_reserved_usage("job-1", "owner-1", 5000)
    assert repo.get("job-1", "owner-1")["reservedTokens"] == 0

    repo.settle_reserved_usage("job-1", "owner-1", 999)
    assert repo.get("job-1", "owner-1")["reservedTokens"] == 0
