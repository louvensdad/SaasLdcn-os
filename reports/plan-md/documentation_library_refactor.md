# Engineering Documentation Library — Phase 1 (vertical slice)

## Scope delivered
A narrow but complete, demoable end-to-end slice that turns the generic Documentation
panel into a real **Engineering Documentation Library** backed by live project data.

Source of truth: **the generated project files on disk**. The engine owns no storage; it
reads, validates, scores and exports the canonical files in place. Architecture stays ready
for a future Documentation Registry that would *reference* the same files.

## What was built

### Backend
- `app/engines/documentation_engine.py` — `DocumentationEngine`
  - Discovers documentation files from a generated project (catalog + aliases + `/docs`).
  - Validates: completeness, consistency (doc vs. real project), security (exposed secrets),
    quality (placeholders / too short).
  - Computes a **real Documentation Score** (0–100) from those signals — never invented.
  - Exports validated docs into the project's `/docs` (README stays at root), writing an
    `INDEX.md`; blocks export when docs are unsafe or required docs are missing.
- `app/schemas/documentation.py` — response/contract models.
- `app/routes/documentation.py` — `GET /projects/{id}/documentation`,
  `POST /projects/{id}/documentation/export`; wired into `main.py` (protected).

### Frontend
- `app/(app)/documentation/page.tsx` rebuilt as a three-pane library:
  - **Left**: projects (only those with a generated project) + searchable document list with
    per-document status badges.
  - **Center**: Markdown preview of the selected real file + its issues.
  - **Right**: Documentation Score, the four validation checks, findings, and the
    Export-to-`/docs` action (disabled when unsafe / incomplete).
- `lib/api` (endpoints + client), `hooks/use-documentation-library.ts`,
  `packages/contracts/documentation.contract.ts`, and i18n keys (en-US base + pt-BR).

## Honesty guarantees
- No AI Writer in this phase (next phase). No fake documents, no invented score.
- Library only lists projects that actually have generated files.
- Document content is fetched through the existing secret-filtered file endpoint.
- Export is blocked when secrets are present or required docs are missing.

## Per-document status model
`missing · draft · generated · validated · inconsistent · unsafe · exported`

## Documentation Score
```
100
- 12 × missing required docs
- 25 × docs exposing secrets
-  8 × docs inconsistent with the project
-  4 × draft/placeholder/too-short docs   (clamped 0..100)
```

## Validation
- Backend: `apps/api/tests/test_documentation.py` (10 tests) — analyze/score, missing doc,
  secret→unsafe + blocked export, inconsistency detection (+ consistent counter-case),
  placeholder→draft, export writes `/docs` & moves files, export blocked (unsafe / missing).
- Full backend suite: **314 passed, 1 skipped**.
- Web: `tsc --noEmit` clean · `next build` ✓ (`/documentation` 5.5 kB).

## Next phase
`documentation_ai_writer` with honest deterministic fallback ("Preview determinístico"),
generating docs from PromptMaster / Blueprint when an LLM is active.
