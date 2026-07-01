from __future__ import annotations

import app.main as main_mod
from app.core.config import Settings


def test_interactive_docs_only_enabled_in_local(monkeypatch):
    # Docs (Swagger/ReDoc/openapi.json) are unauthenticated; only local dev may
    # expose them. Staging is often externally reachable → must be disabled too
    # (audit S4/M9).
    for environment, enabled in (("local", True), ("staging", False), ("production", False)):
        monkeypatch.setattr(main_mod, "get_settings", lambda env=environment: Settings(environment=env))
        app = main_mod.create_application()
        assert app.docs_url == ("/docs" if enabled else None)
        assert app.redoc_url == ("/redoc" if enabled else None)
        assert app.openapi_url == ("/openapi.json" if enabled else None)
