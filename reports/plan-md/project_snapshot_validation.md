# Project Snapshot Validation

Validated on 2026-05-20.

## Snapshot Rules

- Saved snapshots are sanitized before persistence
- Sensitive keys and sensitive value patterns are redacted
- Snapshot payloads preserve the validated blueprint, Prompt Master, and Gatekeeper structure
- No secrets are stored in the saved project snapshots

## Notes

- The live SQLite database contained legacy draft rows with incomplete readiness metadata
- Those draft rows are filtered out of the public project registry so only real persisted projects are listed
- New saves are written with `project_id` and `project_key` compatibility for the existing database schema

## Validation

- `pytest apps/api/tests/test_project_registry.py`
- Direct repository save verification against the live SQLite database

