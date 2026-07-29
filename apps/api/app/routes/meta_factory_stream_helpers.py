from __future__ import annotations

import json


def _sse(event: dict, *, event_id: str | None = None) -> str:
    prefix = f"id: {event_id}\n" if event_id else ""
    return f"{prefix}data: {json.dumps(event, ensure_ascii=False)}\n\n"


def _event_start_index(events: list[dict], last_event_id: str | None) -> int:
    """Resume after the last acknowledged persisted execution event.

    If the cursor has fallen outside the retained 2,000-event window, replay the
    retained window from its beginning; the frontend deduplicates by event id.
    """
    if not last_event_id:
        return 0
    return next(
        (index + 1 for index, event in enumerate(events) if event.get("id") == last_event_id),
        0,
    )


def _slim_event(event: dict) -> dict:
    """Cap the streamed stdout/stderr tails on an execution event so a single SSE
    frame never carries a huge payload (the per-command full tails stay bounded)."""
    cap = 4000
    slim = dict(event)
    for field in ("stdout", "stderr", "message"):
        value = slim.get(field)
        if isinstance(value, str) and len(value) > cap:
            slim[field] = value[-cap:]
    return slim