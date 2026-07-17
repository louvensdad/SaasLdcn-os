from __future__ import annotations

from typing import Any

from app.schemas.common import ApiModel


class UserPreferencesBlob(ApiModel):
    """Opaque JSON preference blob. The shape is owned and versioned by the
    frontend Zustand store (Interface tab / IA tab) -- the backend only needs
    to round-trip it faithfully so it survives logout and process restarts."""

    data: dict[str, Any] | None = None
