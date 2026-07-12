# Documentation Export — Copy-by-default Behavior

Adjusted per review: export must **not** move documents automatically.

## Default: copy-to-docs
`POST /projects/{id}/documentation/export` (no body, or `{ "organize": false }`):
- `README.md` stays at the project root.
- `docs/INDEX.md` is created (index + score + per-document status).
- `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/SECURITY.md`, … are **copied** into `/docs`.
- **Originals are left in place** — links, scripts, tooling and project history keep working.
- Files already under `/docs` stay where they are (idempotent, no duplication).

Response: `{ exported: true, organized: false, docs_dir, exported_paths, score }`.

## Opt-in: organize and move
Only when the user explicitly chooses it (`{ "organize": true }`, surfaced in the UI as the
checkbox **“Organizar e mover originais para /docs”**): non-README originals are moved into
`/docs` instead of copied. Response carries `organized: true`.

## Why
Moving by default would silently break relative links, build scripts and tooling expectations,
and rewrite project history. Copy is the safe, reversible default; moving is a conscious choice.

## Tests
`test_export_copies_to_docs_by_default_without_moving` (originals kept),
`test_export_organize_moves_originals` (moved only with `organize=True`).
