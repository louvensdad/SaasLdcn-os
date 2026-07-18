from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool, text

from app.core.config import get_settings
from app.core.database import Base
import app.models  # noqa: F401 - registers every model on Base.metadata

config = context.config
config.set_main_option("sqlalchemy.url", get_settings().database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=get_settings().database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def _ensure_wide_version_table(connectable) -> None:
    """Pre-create alembic_version with room for our long revision ids.

    Alembic hardcodes version_num as VARCHAR(32) (alembic/ddl/impl.py
    version_table_impl) and only creates the table if it doesn't already
    exist (checkfirst=True) -- it never widens one that's already there.
    Several revision ids in this project (e.g.
    20260716_n1_user_preferences_and_runtime_config, 44 chars) exceed that,
    so a fresh Postgres database fails mid-migration with
    "StringDataRightTruncation: value too long for type character varying(32)".
    Creating the table ourselves first, wide enough, makes Alembic reuse it
    as-is. SQLite doesn't enforce VARCHAR length, so this is a harmless no-op
    there.
    """
    with connectable.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE IF NOT EXISTS alembic_version ("
                "version_num VARCHAR(255) NOT NULL, "
                "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))"
            )
        )


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    _ensure_wide_version_table(connectable)
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            render_as_batch=connection.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()