# Documentation Validation

Validation runs against the real project files before a Documentation Score is computed or
documentation is exported. Four checks are surfaced in the library's right panel.

## Checks
| id | category | fails / warns when |
| --- | --- | --- |
| `completeness` | warning | a required document is missing |
| `consistency` | warning | a document describes technology the project does not contain |
| `security` | **failed** (blocking) | a document exposes a secret-like value |
| `quality` | warning | a document still contains placeholders or is too short |

## Security check
Reuses the secret-assignment heuristic from the Generated Project Quality engine
(`secret/token/password/api_key/...= <12+ chars>`), skipping known safe placeholders
(`change-me`, `placeholder`, `example`, `your-`, …). Any real value marks the document
`unsafe`, sets `safe = false`, and **blocks export**.

## Consistency check (high-signal, conservative)
Compares document prose against project signals derived from `requirements.txt`,
`pyproject.toml`, `package.json`, `docker-compose.yml`, `.env.example`, `pom.xml` and the
file tree:
- mentions PostgreSQL → project has no Postgres dependency/config
- mentions Docker → no Dockerfile / docker-compose
- mentions JWT/auth → no auth code or dependency

Kept intentionally narrow to avoid false positives.

## Quality check
Flags unresolved placeholders (`TODO`, `TBD`, `FIXME`, `LOREM IPSUM`, `<PLACEHOLDER>`,
`REPLACE_ME`, `{{`, `XXX`) and documents shorter than 80 characters as `draft`.

## Tests
`apps/api/tests/test_documentation.py` covers each check, the score, and the export gate
(10 tests). Full backend suite: 314 passed, 1 skipped.
