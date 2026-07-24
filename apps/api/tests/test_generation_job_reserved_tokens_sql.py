"""Regression guard for the UndefinedFunction crash reported against
generation_job_repository.settle_reserved_usage():

    psycopg2.errors.UndefinedFunction: function max(integer, integer) does not exist

PostgreSQL has no scalar two-argument MAX(a, b) -- only the aggregate
MAX(column) form. SQLite's MAX() happens to accept both forms (1 arg =
aggregate, 2+ args = scalar), which is exactly why the bug shipped unnoticed
against this app's SQLite-backed dev/test default and only surfaced against
real PostgreSQL.

The fix floors the release at zero with a CASE expression instead of any
dialect-specific MAX/GREATEST call, so it must compile -- and behave
correctly under NULL inputs -- identically on both SQLite and PostgreSQL.
"""
from __future__ import annotations

import inspect
import re

from sqlalchemy import Integer, case, cast, create_engine, func, literal, select, update
from sqlalchemy.dialects import postgresql, sqlite

from app.models.persistence import GenerationJob
from app.repositories import generation_job_repository as repo_module


def _settle_values(reserved: int = 400, input_tokens: int = 10, output_tokens: int = 20):
    # Mirrors the .values(...) built inside GenerationJobRepository.settle_reserved_usage.
    remaining_reserved = func.coalesce(GenerationJob.reserved_tokens, 0) - reserved
    return dict(
        reserved_tokens=case(
            (remaining_reserved > 0, remaining_reserved),
            else_=cast(0, Integer),
        ),
        input_tokens_total=func.coalesce(GenerationJob.input_tokens_total, 0) + input_tokens,
        output_tokens_total=func.coalesce(GenerationJob.output_tokens_total, 0) + output_tokens,
    )


def _settle_statement(**kwargs):
    return (
        update(GenerationJob)
        .where(GenerationJob.id == "job-x", GenerationJob.owner_user_id == "owner-x")
        .values(**_settle_values(**kwargs))
    )


def _compiled(stmt, dialect) -> str:
    return str(stmt.compile(dialect=dialect, compile_kwargs={"literal_binds": True}))


def test_settle_reserved_usage_never_emits_scalar_two_argument_max():
    for dialect in (postgresql.dialect(), sqlite.dialect()):
        sql = _compiled(_settle_statement(), dialect)
        assert re.search(r"\bmax\s*\(", sql, flags=re.IGNORECASE) is None, sql


def test_settle_reserved_usage_compiles_on_postgresql_and_sqlite():
    # The original bug only reproduced on PostgreSQL; SQLite accepted the
    # broken statement without complaint. Compiling (and, below, executing)
    # against both dialects is what would have caught it.
    for dialect in (postgresql.dialect(), sqlite.dialect()):
        sql = _compiled(_settle_statement(), dialect)
        assert "case" in sql.lower()
        assert "coalesce(generation_jobs.reserved_tokens, 0)" in sql.lower()
        assert "coalesce(generation_jobs.input_tokens_total, 0)" in sql.lower()
        assert "coalesce(generation_jobs.output_tokens_total, 0)" in sql.lower()


def test_no_scalar_two_argument_max_anywhere_in_repository_source():
    """func.max(x, y) (scalar form) must not reappear as executable code in this
    module (comments referencing the historical bug are fine). func.max(column)
    used as an aggregate inside a GROUP BY (see metering_repository.py) is
    unrelated and intentionally not covered here."""
    code_lines = [
        line for line in inspect.getsource(repo_module).splitlines()
        if not line.strip().startswith("#")
    ]
    code = "\n".join(code_lines)
    assert "func.max(" not in code
    assert "func.greatest(" not in code  # not portable to this app's SQLite dev/test default


def test_reserved_tokens_expression_clamps_at_zero_with_null_column_both_dialects():
    """Dialect-agnostic proof that COALESCE(NULL, 0) - reserved still floors at
    0 (case d/e: reserved_tokens / totals NULL at the row level), independent
    of any specific table's NOT NULL constraint."""
    engine = create_engine("sqlite://")
    with engine.connect() as connection:
        null_reserved = literal(None, type_=Integer)
        remaining = func.coalesce(null_reserved, 0) - 150
        expr = case((remaining > 0, remaining), else_=cast(0, Integer))
        assert connection.execute(select(expr)).scalar_one() == 0

        null_total = literal(None, type_=Integer)
        assert connection.execute(select(func.coalesce(null_total, 0) + 120)).scalar_one() == 120
    engine.dispose()
