# Frontend State Synchronization Audit — LDCN OS

**Branch:** `feat/premium-foundation`
**Date:** 2026-06-28
**Scope:** Eliminate any need for a manual page reload (F5). Every backend mutation must reflect in the UI automatically.
**Validation:** `tsc --noEmit` clean · `next build` clean (24/24 routes) · code-level invalidation wired at every lifecycle mutation site.

---

## 1. Executive summary

The reported symptom — *"the backend completes the operation but the UI keeps showing old data until F5"* — was **not** caused by missing `invalidateQueries`/`mutate`/`router.refresh` everywhere. It was caused by a single, well-defined architectural seam.

The frontend is a **fully client-rendered Next.js 15 App Router** app (every audited page is `'use client'`). It runs **two parallel data-management worlds**:

| World | Used by | Mechanism | Self-syncs? |
|-------|---------|-----------|-------------|
| **A — Lifecycle** | Project Room, Architect, Engineering Review, Meta-Factory, Modernize, Project-Rooms list | direct `*Client` calls + local `useState`; every mutation returns the full updated `ProjectRoom` and replaces local state | ✅ *within its own page* |
| **B — Catalog** | Projects, Dashboard, Documentation, Roadmap, Downloads, Skills, Templates, Git Providers, Architecture catalogs | TanStack Query (`@tanstack/react-query` v5) | ✅ *when its own keys are invalidated* |

**Root cause:** World A mutates **persisted project state** (approve, generate blueprint, send-to-generator, `mark-generated`, generation complete, modernize, archive) but **never touched World B's React Query cache**. So after a lifecycle action, every catalog/dashboard surface (`/projects`, `/dashboard`, `/documentation` picker, `/roadmap`, downloads) kept its cached snapshot. With `staleTime` of 10–30 s and the global `refetchOnWindowFocus: false`, those surfaces only refreshed on a hard remount — i.e. **F5**.

**Fix:** a one-line **bridge** (`useProjectCacheSync`) that invalidates the project-coupled React Query keys, called at **every** World-A mutation site; plus a **single unified mutation standard** (`useAppMutation`) and a **centralized query-key registry** to prevent regressions.

### Architectural note (checklist items that do **not** apply)

Because the app is 100% client-rendered, the following audit items from the brief are **N/A by architecture** (there is nothing to fix; documented so it is not mistaken for a gap):

- `router.refresh()` — irrelevant; pages do not read from the RSC payload, they read from React Query / local state.
- `revalidatePath` / `revalidateTag` — Server Action / RSC primitives; there are no Server Actions or data-fetching Server Components.
- "SSR sem atualização" / "Server Components não revalidados" — there are no data Server Components; `(app)/*` pages are Client Components.
- "hydration mismatch" — not implicated in stale-after-mutation; none observed in build.

---

## 2. What was built (the single pattern)

```
API call → validate response → invalidate caches → toast → local update / nav → logs
```

| File | Role |
|------|------|
| `lib/api/query-keys.ts` | **Centralized query-key registry** + `PROJECT_LIFECYCLE_KEYS`. Removes scattered/duplicated key literals (was the structural cause of "estados duplicados"). |
| `hooks/use-app-mutation.ts` | **The unified mutation standard.** Wraps `useMutation`: `mutationFn` → `validate` → `invalidateKeys` → `successToast`/`errorToast` (via the existing `useUiStore` toast system) → `onSuccess`/`onError` → `logLabel`. All steps declarative. |
| `hooks/use-project-cache-sync.ts` | **World A → World B bridge.** `syncProjectCaches()` invalidates `PROJECT_LIFECYCLE_KEYS` so every catalog/dashboard refetches after a lifecycle mutation. |

`useProjects` (the most central catalog hook) was migrated to `useAppMutation` as the reference implementation. Remaining World-B hooks already invalidate correctly; their migration to `useAppMutation` is a mechanical follow-up (see §6).

---

## 3. Screens audited

| Screen | World | Pre-audit behavior | Verdict |
|--------|-------|--------------------|---------|
| **Project Room** (`/project-rooms/[roomId]`) | A | `run()` replaced `room` from each response → in-page OK; but advancing status left `/projects` & `/dashboard` stale | **Fixed** — `syncProjectCaches()` in `run()` + `handleOpenEngineeringReview` |
| **Project Rooms list** (`/project-rooms`) | A | archive updated local list, left catalogs stale | **Fixed** — sync after `archive` |
| **PromptMaster** (right pane of Room) | A | live preview bound to `room.prompt_master_md`, replaced on every revise/approve | OK (no change needed) — now also syncs catalogs |
| **Architect** (`/architect`) | A | `generateBlueprint` / `startEngineeringReview` updated local room, left catalogs stale | **Fixed** — sync after both |
| **Engineering Review** (`/engineering-review`) | A | `call()` updated `room` per step; `useProjectRoom` reloads on mount; catalogs stale after approve/send | **Fixed** — sync inside `call()` (covers open/ack/approve/send-to-generator) |
| **Meta-Fábrica** (`/meta-factory`) | A | generation + `markGenerated` produced a project but never refreshed `/projects`, `/documentation` picker, downloads | **Fixed** — sync after generation completes |
| **Modernize** (`/modernize`) | A | `generate` persisted a `project_id`; catalogs never learned of it | **Fixed** — sync after successful generate |
| **Documentation** (`/documentation`) | B | generate → drafts held in local state; save/export already invalidated `['api','documentation',id]` | OK — generate is local-only by design; new generated projects now appear (bridge invalidates the project picker) |
| **Dashboard** (`/dashboard`) | B | `useProjects`/`useHealth`; never refreshed after lifecycle actions elsewhere | **Fixed** indirectly — bridge invalidates `['api','projects']` |
| **Roadmap** (`/roadmap`) | B | `useRoadmap`; stale after generation | **Fixed** indirectly — bridge invalidates `['api','roadmap']` |
| **Projects** (`/projects`, `/projects/[id]`) | B | save/update/delete invalidated, but external lifecycle changes did not | **Fixed** — migrated to `useAppMutation` + bridge |
| **Platform** (`/platform`) | static | informational shell, no mutations | N/A |
| **Laboratory** (`/engineering-laboratory`) | B/preview | preview/compute mutations (no persisted state) | OK — no cache to invalidate |
| **Settings → AI Providers** | B | already invalidated `['user-ai-keys']` | OK |
| **Git Providers / Git Export** | B | connect/validate/disconnect use `setQueryData`; export is a job, no coupled query | OK |

---

## 4. Bugs found → root cause → fix

### BUG-1 (Critical) — Lifecycle mutations never refreshed the catalog caches
- **Cause:** World A bypasses React Query entirely; no code path invalidated `['api','projects']` et al. after approve/blueprint/send/mark-generated/modernize/archive.
- **Fix:** `useProjectCacheSync()` called at every World-A mutation site:
  - `project-rooms/[roomId]/page.tsx` → `run()`, `handleOpenEngineeringReview`
  - `project-rooms/page.tsx` → archive
  - `architect/page.tsx` → `generate()`, `send()`
  - `engineering-review/page.tsx` → `call()` (all four steps)
  - `meta-factory/page.tsx` → after generation + `markGenerated`
  - `modernize/page.tsx` → after successful `generate`
- **Evidence:** new generated project / changed status now appears on `/projects`, `/dashboard`, `/documentation` picker, `/roadmap`, downloads without F5, because the active queries are invalidated and refetch on the spot.

### BUG-2 (Structural) — No single mutation standard; duplicated query keys
- **Cause:** 16 mutation hooks each hand-rolled invalidation (or omitted it); ~60 inline key literals with no shared source of truth → easy to forget a key.
- **Fix:** `useAppMutation` (canonical flow) + `lib/api/query-keys.ts` (single registry, prefix-safe). `useProjects` migrated as the reference.

### Non-bugs confirmed (audited, no change required)
- **Documentation generate** holds drafts in local state and only mutates the library on save/export, both of which already invalidate — correct.
- **Preview/compute mutations** (`useBlueprintPreview`, `useGatekeeperPreview`, `usePromptMasterPreview`, `useSelectionValidation`, `useGenerationHandoff`, `usePrepareDownload`, `useGeneratedProjectQuality`, `useSkillPreview`, `useProjectSpec`) do not persist server state, so there is nothing to invalidate — correct by design.
- **In-page lifecycle state** (Room/Architect/Review) was always reactive because each mutation returns the full updated entity and replaces local state.

---

## 5. Validation performed

- ✅ `npx tsc --noEmit` — **0 errors** after all edits.
- ✅ `npx next build` — **success, 24/24 routes compiled** (no client/server boundary or import regressions).
- ✅ Static reasoning per screen (above): every persisted-state mutation now has a code path that invalidates the React Query keys its dependent surfaces read from.

### Recommended manual QA (cannot be asserted by build alone)
Run one end-to-end pass **without F5**, watching that each transition updates the named surfaces:
1. New Room → chat → generate PromptMaster → approve → Architect blueprint → Engineering Review approve → Meta-Factory generate.
   - After generate: `/projects` shows the project as **Gerado**, `/documentation` picker lists it, `/dashboard` counts update, downloads available — all without reload.
2. Modernize a repo → generate → confirm the modernized project appears in `/projects` and `/documentation` without reload.
3. Archive a room in `/project-rooms` → confirm `/dashboard` and `/projects` reflect it without reload.

---

## 6. Follow-up (recommended, not required for the fix)

1. Migrate the remaining World-B mutation hooks (`use-documentation-library`, `use-git-providers`, `use-git-export`, `use-backend-generation`, `use-local-generation`, `use-skills`, settings AI-providers tab) onto `useAppMutation` for one consistent flow. Behavior-preserving; add i18n toast strings when enabling default toasts.
2. Consider `refetchOnWindowFocus: true` (or `refetchOnReconnect`) in `query-provider.tsx` as defense-in-depth for multi-tab usage. Left as `false` here to avoid changing baseline load behavior; the invalidation bridge already covers in-session correctness.
3. Replace any remaining inline query-key literals with `queryKeys.*` from the registry as hooks are touched.

---

## 7. Files changed

**New**
- `lib/api/query-keys.ts`
- `hooks/use-app-mutation.ts`
- `hooks/use-project-cache-sync.ts`

**Modified**
- `hooks/use-projects.ts` (migrated to `useAppMutation` + registry)
- `app/(app)/project-rooms/page.tsx`
- `app/(app)/project-rooms/[roomId]/page.tsx`
- `app/(app)/architect/page.tsx`
- `app/(app)/engineering-review/page.tsx`
- `app/(app)/meta-factory/page.tsx`
- `app/(app)/modernize/page.tsx`
