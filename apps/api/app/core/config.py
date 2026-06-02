from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "app" / "data"


class Settings(BaseModel):
    app_name: str = "LDCN OS Backend API"
    app_version: str = "0.1.0"
    api_prefix: str = "/api"
    environment: str = "local"
    debug: bool = False
    log_level: str = "INFO"
    allowed_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
            "http://localhost:3003",
            "http://127.0.0.1:3003",
        ]
    )
    sqlite_path: Path = DATA_DIR / "ldcn_os.db"
    contracts_ready: bool = True


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    return settings
