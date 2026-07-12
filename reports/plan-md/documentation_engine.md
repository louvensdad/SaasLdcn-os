# Documentation Engine

`app/engines/documentation_engine.py` — a visualization/validation layer over a generated
project's real files. It never copies documentation into a separate store.

## Responsibilities
- **Discover** documentation files from the generated project root.
- **Validate** them (completeness, consistency, security, quality).
- **Score** the documentation from real signals.
- **Export** the validated set into the standard `/docs` layout, in place.

## Document catalog
Required: `README.md`, `ARCHITECTURE.md`, `API.md`, `DATABASE.md`, `SECURITY.md`,
`TESTING.md`, `DEPLOYMENT.md`.
Optional: `CHANGELOG.md`, `PROMPTMASTER.md`, `BLUEPRINT.md`, `QUALITY_REPORT.md`,
`OPENAPI.yaml` (+ aliases such as `openapi.yml`, `prompt_master.md`, `traceability.md`).
Discovery prefers a root-level file but also resolves files already under `/docs`.

## Safety
- Project root must stay inside the LDCN OS workspace and carry `.ldcn-generation.json`
  (same guard as the Generated Project Quality engine).
- Path containment on every write (`_resolve_inside`); README never leaves the root.
- Document **content is never returned** by the analyze endpoint — only metadata, statuses,
  issues, checks and findings. Raw content is fetched through the existing secret-filtered
  file-content endpoint.

## Export semantics (no duplication)
- Non-README catalog docs are **moved** (not copied) into `/docs`.
- Files already under `/docs` stay in place.
- A generated `docs/INDEX.md` lists every document with its category and status.
- Export is refused when any document is `unsafe`, or when a required document is missing.

## Future Documentation Registry
Versioning, comments, approvals and AI suggestions can be layered on later. They must
*reference* these files — the generated project remains the single source of truth.
