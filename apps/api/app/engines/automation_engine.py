from __future__ import annotations

import time
from typing import Any

import httpx

from app.engines.metering_engine import record_consumption
from app.repositories.automation_repository import AutomationRepository

# Automation as a first-class project type (vault DEC-004 + 06 - Automacoes/*).
#
# Scope decision (2026-07-20, confirmed with the user): a "fluxo linear mínimo"
# v1 -- explicitly NOT the full vault vision. Built:
#   - Trigger: manual, or scheduled via a real in-process poller (see
#     app/services/automation_scheduler.py) using real CRON parsing (croniter).
#   - Action: a single "http_request" call (GET/POST/PUT/PATCH/DELETE),
#     credentials referenced via a {{credential:name}} placeholder, resolved
#     only in-memory at execution time and masked back out before persistence.
#   - Retry: fixed attempts + exponential backoff on transient failures
#     (connection errors, 5xx) -- no dead-letter queue or compensation actions.
#   - Execution history: real, per-run, masked request/response.
# Explicitly NOT built: visual flow editor, conditions/branching/loops,
# webhooks (signature validation/rate limiting), other trigger types (email/
# db-change/form/file-watch), other action types (send email, CRUD, transform,
# execute agent, ...), dry-run/step-by-step testing. All real vault-documented
# features, deferred rather than half-built.

_MAX_ATTEMPTS = 3
_BACKOFF_BASE_S = 1.0
_MAX_RESPONSE_CHARS = 4000


def _substitute(value: str | None, credentials: dict[str, str]) -> str | None:
    if value is None:
        return None
    for name, secret in credentials.items():
        value = value.replace(f"{{{{credential:{name}}}}}", secret)
    return value


def resolve_action_config(action_config: dict[str, Any], credentials: dict[str, str]) -> dict[str, Any]:
    """Substitutes {{credential:name}} placeholders with real decrypted
    values -- kept in memory for one execution only, never persisted."""
    return {
        "method": action_config.get("method", "GET"),
        "url": _substitute(action_config.get("url", ""), credentials) or "",
        "headers": {k: _substitute(str(v), credentials) or "" for k, v in (action_config.get("headers") or {}).items()},
        "body": _substitute(action_config.get("body"), credentials),
    }


def _mask(text: str, credentials: dict[str, str]) -> str:
    for name, secret in credentials.items():
        if secret:
            text = text.replace(secret, f"[REDACTED:{name}]")
    return text


def mask_request(action_config: dict[str, Any], credentials: dict[str, str]) -> dict[str, Any]:
    """What actually gets persisted to AutomationRun -- every resolved
    credential value replaced back out, regardless of where it appears."""
    return {
        "method": action_config.get("method", "GET"),
        "url": _mask(str(action_config.get("url", "")), credentials),
        "headers": {k: _mask(str(v), credentials) for k, v in (action_config.get("headers") or {}).items()},
        "body": _mask(str(action_config.get("body")), credentials) if action_config.get("body") else None,
    }


def execute_http_action(action_config: dict[str, Any], credentials: dict[str, str]) -> tuple[int | None, str | None, str | None, int]:
    """Real HTTP call via httpx (already a dependency), with retry on
    transient failure. Returns (status_code, response_text, error, attempts)."""
    resolved = resolve_action_config(action_config, credentials)
    attempt = 0
    last_error: str | None = None
    while attempt < _MAX_ATTEMPTS:
        attempt += 1
        try:
            response = httpx.request(
                resolved["method"], resolved["url"], headers=resolved["headers"],
                content=resolved["body"], timeout=30.0,
            )
            if response.status_code >= 500 and attempt < _MAX_ATTEMPTS:
                last_error = f"HTTP {response.status_code}"
                time.sleep(_BACKOFF_BASE_S * (2 ** (attempt - 1)))
                continue
            return response.status_code, response.text[:_MAX_RESPONSE_CHARS], None, attempt
        except httpx.TransportError as exc:
            last_error = str(exc)
            if attempt < _MAX_ATTEMPTS:
                time.sleep(_BACKOFF_BASE_S * (2 ** (attempt - 1)))
                continue
            return None, None, last_error, attempt
    return None, None, last_error, attempt


def run_automation(automation: dict[str, Any], *, trigger_source: str, repository: AutomationRepository | None = None) -> dict[str, Any]:
    """Orchestrates one execution: start -> resolve credentials -> call ->
    mask -> finish. Always finishes the run record (succeeded or failed),
    never leaves one stuck in 'running'."""
    repo = repository or AutomationRepository()
    run = repo.start_run(automation["id"], automation["owner_user_id"], trigger_source=trigger_source)
    credentials = repo.resolve_credentials(automation["id"])
    action_config = automation["action_config"]
    # Metering (vault 56 - Monetização e Consumo): every attempted run
    # consumes real platform compute regardless of outcome.
    record_consumption(
        owner_user_id=automation["owner_user_id"], resource_type="automation_run", quantity=1,
        unit="count", origin=f"automation:{automation['id']}:{run['id']}",
    )

    if automation.get("action_type") != "http_request":
        return repo.finish_run(
            run["id"], status="failed", masked_request=None, response_status_code=None,
            masked_response=None, error=f"Unsupported action_type '{automation.get('action_type')}'.", retry_count=0,
        )

    status_code, response_text, error, attempts = execute_http_action(action_config, credentials)
    masked_request = mask_request(action_config, credentials)
    masked_response = {"body": _mask(response_text, credentials)} if response_text is not None else None
    succeeded = error is None and status_code is not None and status_code < 400
    return repo.finish_run(
        run["id"], status="succeeded" if succeeded else "failed", masked_request=masked_request,
        response_status_code=status_code, masked_response=masked_response,
        error=error or (None if succeeded else f"HTTP {status_code}"), retry_count=attempts - 1,
    )
