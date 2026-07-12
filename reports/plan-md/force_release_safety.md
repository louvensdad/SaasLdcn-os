# Force-Release Safety

## Conscious, auditable override
"Liberar mesmo assim" is intentionally a **secondary, friction-ful** action:
`POST /meta-factory/{id}/force-release` requires the body `confirmation` to equal the **exact
phrase** `LIBERAR COM RISCO` (locale-independent, defined as `CONSCIOUS_RELEASE_PHRASE`). Any
other value → **HTTP 400**.

On success the engine writes a `release_override` record onto the project marker
(`ProjectWriter.set_release_override`: `{active, by, reason, at}`) — after which the export/
download gate (`_require_verified`) allows delivery even with unresolved BLOCKERS.

## Audit trail
- `force_release_requested` — recorded the moment the endpoint is hit (even if the phrase is wrong).
- `force_release_confirmed` — recorded only after the exact phrase is accepted and the override
  is persisted.
Audit entries store only `user_id` + event code (LGPD-safe; no project internals or secrets).

## Tests
`test_force_release_requires_exact_phrase`: wrong phrase → 400; exact phrase → 200 with
`release_override = true`; audit log contains `force_release_requested` + `force_release_confirmed`.

## Next pass (UI)
The web confirmation modal will show blocker/warning counts + risks and require typing
`LIBERAR COM RISCO` before calling this endpoint.
