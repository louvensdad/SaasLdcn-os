# Orphan File Cleanup — `lib/system/engine-icons.ts`

## TL;DR
`engine-icons.ts` was **not** an orphan. Investigation showed it is a dependency of a **complete, wired feature** — the System Status premium grid. The correct resolution was therefore **complete (keep)**, not remove. The file was briefly deleted during investigation and then **restored**; the tree is consistent.

## What I found
The earlier note flagged `lib/system/engine-icons.ts` as an unwired leftover. On inspection:
- `app/(app)/system-status/page.tsx` **imports and renders** `ActiveSystemsGrid` (twice — default and developer mode).
- `components/system/ActiveSystemsGrid.tsx` (149 lines), `components/system/SystemCard.tsx` (65), `hooks/useSystemHealth.ts` (127) form a coherent feature and depend on `engine-icons.ts` for `SystemCategory`, `getSystemIcon`, `CATEGORY_COLOR`, `SYSTEM_CATALOG`.

So the System Status "Active Modules/Engines/Templates/Skills" grid (from the earlier brief) was actually **finished and wired** — `engine-icons.ts` is its icon/catalog map, not a dead file.

## Action taken
1. Briefly removed `engine-icons.ts` → `tsc` immediately reported 3 broken imports + 1 cascade (implicit-any). This **confirmed** it was load-bearing.
2. **Restored** `engine-icons.ts` verbatim (icon map for 5 modules / 31 engines / 4 templates / 16 skills + `SYSTEM_CATALOG` fallback + `getSystemIcon` + `CATEGORY_COLOR`).
3. Re-ran `tsc --noEmit` → clean; `next build` → `/system-status` builds (11.7 kB).

## Outcome
- **No orphan files remain.** The System Status grid is complete and consistent.
- Correction to the earlier report: the "loose end" was a documentation error, not a real orphan. There was nothing to delete.

## Verification
`grep` confirms all four files (`engine-icons.ts`, `ActiveSystemsGrid`, `SystemCard`, `useSystemHealth`) are reachable from `system-status/page.tsx`; `tsc` and `next build` pass.
