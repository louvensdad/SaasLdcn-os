# Modernize Export — Flow & Gating

## Export the corrected project
The modernized project (the materialized `ProjectWriter` project produced by apply-fixes) is
exported via `POST /modernize/{materialized_project_id}/export/{provider}` (GitHub/GitLab),
reusing the existing generated-project export.

## Gating (safe by default)
`_export_generated_project` now blocks export when the **Quality Gate has BLOCKERS**, unless:
- the project carries a conscious release override, or
- the request sets `force=true` ("liberar mesmo assim").

On block → **HTTP 409** with an actionable message (blocker count) + audit `git_export_blocked`.
The pre-existing high/critical security-finding block remains, and the provider must be
connected. Successful export audits `modernized_project_exported`. Behind the `modernize_export`
feature flag (403 when off).

## Secret safety
The user's LLM key is never part of the exported files. The secret scan + blocker gate prevent
shipping a project with exposed credentials unless the user consciously forces it.

## Tests
`test_export_blocked_on_blocker`: a materialized project with structural BLOCKERS → export
raises 409 (force=false). The existing `test_generated_export` (force=true) confirms the
override path still works.

## Next pass (UI)
Export buttons appear only when the project is releasable (`can_release`); the blocked state
surfaces Corrigir / Revalidar / Ver problemas instead of a generic message.
