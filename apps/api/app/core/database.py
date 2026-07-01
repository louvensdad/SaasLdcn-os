from __future__ import annotations

from collections.abc import Iterator, Mapping, Sequence
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def database_url_for(value: str | Path | None = None) -> str:
    if isinstance(value, Path):
        value.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{value.resolve().as_posix()}"
    if isinstance(value, str) and value:
        return value
    return get_settings().database_url


@lru_cache(maxsize=16)
def get_engine(database_url: str | None = None) -> Engine:
    url = database_url_for(database_url)
    kwargs: dict[str, Any] = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
    else:
        kwargs.update(pool_size=10, max_overflow=20)
    return create_engine(url, **kwargs)


def session_factory(database: str | Path | None = None) -> sessionmaker[Session]:
    return sessionmaker(
        bind=get_engine(database_url_for(database)),
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
    )


# Conventional exports for Alembic and code that expects a default session factory.
engine = get_engine()
SessionLocal = session_factory()


class CompatRow(dict[str, Any]):
    """Mapping row with sqlite3.Row-compatible integer access."""

    def __getitem__(self, key: str | int) -> Any:
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


class CompatResult:
    def __init__(self, result: Any) -> None:
        self._result = result
        self.rowcount = int(getattr(result, "rowcount", 0) or 0)

    def fetchone(self) -> CompatRow | None:
        row = self._result.mappings().fetchone()
        return CompatRow(row) if row is not None else None

    def fetchall(self) -> list[CompatRow]:
        return [CompatRow(row) for row in self._result.mappings().fetchall()]


class CompatSession:
    """Small SQLAlchemy adapter used while repositories move from sqlite3 to ORM.

    It accepts both named parameters and the legacy DB-API qmark style, but all
    connections, transactions and pooling are owned by SQLAlchemy.
    """

    def __init__(self, session: Session) -> None:
        self._session = session

    @staticmethod
    def _named(statement: str, params: Sequence[Any]) -> tuple[str, dict[str, Any]]:
        pieces = statement.split("?")
        if len(pieces) - 1 != len(params):
            raise ValueError("SQL placeholder count does not match parameters")
        output = pieces[0]
        bound: dict[str, Any] = {}
        for index, value in enumerate(params):
            name = f"p{index}"
            output += f":{name}{pieces[index + 1]}"
            bound[name] = value
        return output, bound

    def execute(
        self,
        statement: str,
        params: Mapping[str, Any] | Sequence[Any] | None = None,
    ) -> CompatResult:
        sql = statement
        bound: Mapping[str, Any]
        if params is None:
            bound = {}
        elif isinstance(params, Mapping):
            bound = params
        else:
            sql, converted = self._named(statement, params)
            bound = converted
        return CompatResult(self._session.execute(text(sql), bound))


@contextmanager
def connection(database: str | Path | None = None) -> Iterator[CompatSession]:
    session = session_factory(database)()
    try:
        yield CompatSession(session)
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


