from __future__ import annotations

import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_delivery_type_migration_upgrade_and_downgrade(monkeypatch):
    migration_path = Path(__file__).parents[1] / "alembic/versions/20260701_e1_room_delivery_type.py"
    spec = importlib.util.spec_from_file_location("mobile_factory_delivery_type_migration", migration_path)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE project_rooms (room_id VARCHAR PRIMARY KEY)"))
        operations = Operations(MigrationContext.configure(connection))
        monkeypatch.setattr(migration, "op", operations)

        migration.upgrade()
        columns = {column["name"]: column for column in sa.inspect(connection).get_columns("project_rooms")}
        assert "delivery_type" in columns
        assert columns["delivery_type"]["nullable"] is False

        migration.downgrade()
        columns = {column["name"] for column in sa.inspect(connection).get_columns("project_rooms")}
        assert "delivery_type" not in columns
