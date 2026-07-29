"""Real-PostgreSQL regression tests for token reservation/settlement on
generation_jobs. SQLite silently accepts the broken `func.max(a, b)` scalar
form the production crash was built on (SQLite's MAX() is variadic-scalar),
which is exactly why that bug shipped -- so these tests require the same
PostgreSQL dialect production runs on (see LDCN_TEST_POSTGRES_URL, same
convention as test_infrastructure_contracts.py::test_postgresql_round_trip)
and are skipped, not faked, when it isn't provisioned.
"""
from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text

from app.core.database import Base, get_engine
from app.models.user import User
from app.repositories.generation_job_repository import GenerationJobRepository

pytestmark = pytest.mark.integration


def _required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        pytest.skip(f"{name} is required for real-PostgreSQL token reservation tests")
    return value


@pytest.fixture(scope="module")
def database_url() -> str:
    url = _required_env("LDCN_TEST_POSTGRES_URL")
    if not url.startswith("postgresql"):
        pytest.skip("LDCN_TEST_POSTGRES_URL must point at a PostgreSQL database")
    engine = create_engine(url)
    try:
        Base.metadata.create_all(bind=engine)
    finally:
        engine.dispose()
    return url


@pytest.fixture
def repo(database_url: str) -> GenerationJobRepository:
    return GenerationJobRepository(database_url)


@pytest.fixture
def owner(repo: GenerationJobRepository, database_url: str):
    user_id = f"user_{uuid4().hex[:12]}"
    now = datetime.now(UTC).replace(microsecond=0).isoformat()
    engine = get_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users (user_id, email, full_name, role, locale, is_active, is_2fa_enabled, created_at, updated_at) "
                "VALUES (:id, :email, 'Test Owner', 'user', 'pt-BR', true, false, :now, :now)"
            ),
            {"id": user_id, "email": f"{user_id}@example.test", "now": now},
        )
    yield user_id
    # ON DELETE CASCADE takes generation_jobs rows created under this owner with it.
    with engine.begin() as connection:
        connection.execute(text("DELETE FROM users WHERE user_id = :id"), {"id": user_id})


def _create_job(repo: GenerationJobRepository, owner: str, job_id: str) -> None:
    now = datetime.now(UTC).replace(microsecond=0).isoformat()
    repo.create(
        owner,
        {
            "id": job_id,
            "projectId": f"project_{uuid4().hex[:8]}",
            "status": "CONTRACTS_PLANNING",
            "currentStage": "CONTRACTS_PLANNING",
            "createdAt": now,
            "updatedAt": now,
        },
        {},
        {},
    )


@contextmanager
def _reserved_tokens_forced_null(database_url: str, job_id: str):
    """NOT NULL is enforced at the schema level (real DB rows can never be
    NULL) -- this proves the repository's COALESCE defense actually works if
    that invariant is ever violated, rather than merely asserting it can't be."""
    engine = get_engine(database_url)
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE generation_jobs ALTER COLUMN reserved_tokens DROP NOT NULL"))
        connection.execute(
            text("UPDATE generation_jobs SET reserved_tokens = NULL WHERE id = :id"), {"id": job_id}
        )
    try:
        yield
    finally:
        with engine.begin() as connection:
            connection.execute(
                text("UPDATE generation_jobs SET reserved_tokens = 0 WHERE id = :id AND reserved_tokens IS NULL"),
                {"id": job_id},
            )
            connection.execute(text("ALTER TABLE generation_jobs ALTER COLUMN reserved_tokens SET NOT NULL"))


@contextmanager
def _totals_forced_null(database_url: str, job_id: str):
    engine = get_engine(database_url)
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE generation_jobs ALTER COLUMN input_tokens_total DROP NOT NULL"))
        connection.execute(text("ALTER TABLE generation_jobs ALTER COLUMN output_tokens_total DROP NOT NULL"))
        connection.execute(
            text(
                "UPDATE generation_jobs SET input_tokens_total = NULL, output_tokens_total = NULL WHERE id = :id"
            ),
            {"id": job_id},
        )
    try:
        yield
    finally:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "UPDATE generation_jobs SET input_tokens_total = 0 WHERE id = :id AND input_tokens_total IS NULL"
                ),
                {"id": job_id},
            )
            connection.execute(
                text(
                    "UPDATE generation_jobs SET output_tokens_total = 0 WHERE id = :id AND output_tokens_total IS NULL"
                ),
                {"id": job_id},
            )
            connection.execute(text("ALTER TABLE generation_jobs ALTER COLUMN input_tokens_total SET NOT NULL"))
            connection.execute(text("ALTER TABLE generation_jobs ALTER COLUMN output_tokens_total SET NOT NULL"))


# (a) reservation greater than the amount released
def test_settle_reserved_greater_than_released(repo, owner):
    job_id = f"job_{uuid4().hex[:10]}"
    _create_job(repo, owner, job_id)
    assert repo.reserve_tokens(job_id, owner, 1000, daily_limit=1_000_000)

    totals = repo.settle_reserved_usage(job_id, owner, 400, input_tokens=100, output_tokens=50)

    assert totals == (100, 50)
    job = repo.get(job_id, owner)
    assert job["reservedTokens"] == 600
    assert job["inputTokensTotal"] == 100
    assert job["outputTokensTotal"] == 50


# (b) reservation equal to the amount released
def test_settle_reserved_equal_to_released(repo, owner):
    job_id = f"job_{uuid4().hex[:10]}"
    _create_job(repo, owner, job_id)
    assert repo.reserve_tokens(job_id, owner, 500, daily_limit=1_000_000)

    repo.settle_reserved_usage(job_id, owner, 500, input_tokens=200, output_tokens=90)

    job = repo.get(job_id, owner)
    assert job["reservedTokens"] == 0


# (c) amount released greater than the reservation -- must clamp at 0, not go negative,
# and must not raise psycopg2.errors.UndefinedFunction (the original crash).
def test_settle_released_greater_than_reserved_clamps_to_zero(repo, owner):
    job_id = f"job_{uuid4().hex[:10]}"
    _create_job(repo, owner, job_id)
    assert repo.reserve_tokens(job_id, owner, 300, daily_limit=1_000_000)

    totals = repo.settle_reserved_usage(job_id, owner, 5000, input_tokens=10, output_tokens=5)

    assert totals == (10, 5)
    job = repo.get(job_id, owner)
    assert job["reservedTokens"] == 0
    assert job["reservedTokens"] >= 0


# (d) reserved_tokens is NULL at the DB row level
def test_settle_with_reserved_tokens_null(repo, owner, database_url):
    job_id = f"job_{uuid4().hex[:10]}"
    _create_job(repo, owner, job_id)

    with _reserved_tokens_forced_null(database_url, job_id):
        totals = repo.settle_reserved_usage(job_id, owner, 150, input_tokens=1, output_tokens=1)

    assert totals is not None
    job = repo.get(job_id, owner)
    assert job["reservedTokens"] == 0


# (e) input_tokens_total / output_tokens_total are NULL at the DB row level
def test_settle_with_totals_null(repo, owner, database_url):
    job_id = f"job_{uuid4().hex[:10]}"
    _create_job(repo, owner, job_id)
    assert repo.reserve_tokens(job_id, owner, 200, daily_limit=1_000_000)

    with _totals_forced_null(database_url, job_id):
        totals = repo.settle_reserved_usage(job_id, owner, 200, input_tokens=120, output_tokens=80)

    assert totals == (120, 80)
    job = repo.get(job_id, owner)
    assert job["inputTokensTotal"] == 120
    assert job["outputTokensTotal"] == 80


# (f) concurrent settlement of the same generation job must not lose an update
def test_concurrent_settle_same_job_is_atomic(repo, owner):
    job_id = f"job_{uuid4().hex[:10]}"
    _create_job(repo, owner, job_id)
    assert repo.reserve_tokens(job_id, owner, 1000, daily_limit=1_000_000)

    def _settle(reserved: int, input_tokens: int, output_tokens: int):
        return repo.settle_reserved_usage(job_id, owner, reserved, input_tokens=input_tokens, output_tokens=output_tokens)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(_settle, 300, 100, 50),
            pool.submit(_settle, 300, 70, 30),
        ]
        results = [future.result() for future in futures]

    assert all(result is not None for result in results)
    job = repo.get(job_id, owner)
    assert job["reservedTokens"] == 400  # 1000 - 300 - 300
    assert job["inputTokensTotal"] == 170  # 100 + 70
    assert job["outputTokensTotal"] == 80  # 50 + 30


# (g) provider fails before returning any usage -- reservation must still release
def test_settle_after_provider_failure_releases_full_reservation(repo, owner):
    job_id = f"job_{uuid4().hex[:10]}"
    _create_job(repo, owner, job_id)
    reserved_tokens = 800
    assert repo.reserve_tokens(job_id, owner, reserved_tokens, daily_limit=1_000_000)

    try:
        raise RuntimeError("simulated provider failure before usage was returned")
    except RuntimeError:
        # Mirrors the `except Exception: settle_reserved_usage(...)` path in
        # GenerationJobEngine._run_agent_with_timeout -- no usage to report.
        totals = repo.settle_reserved_usage(job_id, owner, reserved_tokens)

    assert totals == (0, 0)
    job = repo.get(job_id, owner)
    assert job["reservedTokens"] == 0


# (h) releasing a reservation with zero tokens actually consumed
def test_settle_release_with_zero_tokens_consumed(repo, owner):
    job_id = f"job_{uuid4().hex[:10]}"
    _create_job(repo, owner, job_id)
    assert repo.reserve_tokens(job_id, owner, 250, daily_limit=1_000_000)

    totals = repo.settle_reserved_usage(job_id, owner, 250, input_tokens=0, output_tokens=0)

    assert totals == (0, 0)
    job = repo.get(job_id, owner)
    assert job["reservedTokens"] == 0
    assert job["inputTokensTotal"] == 0
    assert job["outputTokensTotal"] == 0


# (i) reserved_tokens must never go negative across repeated over-releases
def test_reserved_tokens_never_negative_across_repeated_overrelease(repo, owner):
    job_id = f"job_{uuid4().hex[:10]}"
    _create_job(repo, owner, job_id)
    assert repo.reserve_tokens(job_id, owner, 100, daily_limit=1_000_000)

    repo.settle_reserved_usage(job_id, owner, 5000)
    job = repo.get(job_id, owner)
    assert job["reservedTokens"] == 0

    # Settling again against an already-zeroed reservation must still clamp at 0
    # (regression target: this is exactly the shape of the reported crash).
    repo.settle_reserved_usage(job_id, owner, 999)
    job = repo.get(job_id, owner)
    assert job["reservedTokens"] == 0
