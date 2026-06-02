# Secure Extension Status Validation

## Roadmap

`GET /api/roadmap` exposes:

- `user_key_boost`: `PLANNED`
- `git_export`: `PLANNED`
- `pdf_contract_input`: `PLANNED`

## System Status

`GET /api/system-status` exposes `planned_extensions` with:

- `user_key_boost`: `inactive`, lifecycle `planned`
- `git_export`: `inactive`, lifecycle `planned`
- `pdf_contract_input`: `inactive`, lifecycle `planned`

## Tests

`apps/api/tests/test_secure_extensions.py` verifies:

- all placeholder endpoints return `501`
- placeholder payload is stable and safe
- submitted `api_key` values are not echoed
- roadmap marks extensions as planned
- system-status marks extensions as inactive/planned
