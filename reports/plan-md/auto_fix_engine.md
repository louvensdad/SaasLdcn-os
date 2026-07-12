# Auto-Fix Engine

## Status
**Implemented** — a real, confirm-before-apply Auto-Fix flow at `/auto-fix`, wiring the Modernize backend pipeline (which was backend-only) into the frontend.

## The flow (all real endpoints)
```
ingest (ZIP upload / Git URL)   → POST /modernize/projects/upload | /projects/git  → ModernizeProject
analyze                          → POST /modernize/{id}/analyze                     → { report, plan }
review (the patch preview)       → findings + scores + phased plan, shown on screen
approve plan (mode)              → POST /modernize/{id}/approve-plan                → FixApproval
apply fixes (confirm)            → POST /modernize/{id}/apply-fixes                 → RefactorResult
revalidate + diff                → POST /{id}/revalidate · GET /{id}/diff           → before/after, changed paths
```

## Rules honored
- **Problems explained before any fix** — each `CodeIssue` renders title, severity, `file:line`, **root cause** (explanation) and **recommendation** (how to fix) + an `auto_fixable` badge. This is the patch preview.
- **User sees affected files** — the phased plan (per-phase action counts) is shown, and after applying, the `CodeDiffSummary.changed_paths` lists every changed file.
- **Explicit confirmation** — the user selects an approval mode (`critical_only` / `full` / `custom`), then a `window.confirm` gate fires before `apply-fixes`.
- **No background auto-apply** — nothing runs without the user clicking through; fixes are written to a **new materialized copy** (`materialized_project_id`), never overwriting the input.

## No fabricated data
Everything shown comes from the backend: real `CodebaseScores` (11 dims), executive report (health/risk/effort/impact/top problems), technical issues, plan phases, `RefactorResult` (applied/failed counts + actions), `RevalidationReport` deltas, and `CodeDiffSummary` changed paths. `report.degraded` honestly labels **Deterministic preview** (no key) vs **AI-enriched**.

## Files
- `lib/api/modernize.ts` — extended: `createProjectZip/Git`, `analyze`, `approvePlan`, `applyFixes`, `revalidate`, `diff` + contract type re-exports.
- `app/(app)/auto-fix/page.tsx` — the multi-step flow.
- i18n `autoFix.*` (en-US + pt-BR); nav + shell wiring.

## Validation
`tsc --noEmit` clean · `next build` ✓ (`/auto-fix` 6.18 kB).
