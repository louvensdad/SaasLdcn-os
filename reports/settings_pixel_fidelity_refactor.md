# Settings Pixel-Fidelity Refactor

Reproduces the two reference screenshots (`docs/design-system/settings-reference.png.png` —
Avançado tab, `docs/design-system/systemsettings-reference-conta.png.png` — Conta tab) as the
official visual spec for `/settings`, plus the two shell-level changes needed to get there: a
permanently-navy sidebar (product identity, not a themed surface) and a `Topbar` that supports
per-route configuration (breadcrumb, custom title, a primary action) without duplicating the
search/notifications/locale/theme controls it already renders on every page.

## Scope

Explicitly agreed with the user before building, since the reference implied changes reaching
beyond Settings itself:

- **In scope**: sidebar navy identity (global — the Sidebar component is shared across every
  route via `AppShell`), `Topbar` → `TopbarConfig` evolution (infrastructure, applied concretely
  to `/settings` only), pixel-fidelity rebuild of Conta and Avançado (the two tabs with reference
  images), the same premium card language (larger radius, softer shadows) applied to
  IA/Git/Interface/Runtime for visual consistency.
- **Out of scope, not attempted**: redesigning other routes (Dashboard, Engineering Review, etc.),
  a global typography rescale, and the more elaborate new-capability asks that came up during
  scoping (Bitbucket/Azure DevOps/Gitea in Git, CPU/RAM dashboards in Runtime, an AI pipeline/
  memory/token-graph system) — none of that data exists anywhere in the backend today, and this
  session has held a consistent never-fabricate line throughout the Settings work.

## Files changed

**Shell (global, affects every route):**
- `app/globals.css` — new non-themed `--sidebar-*` tokens (bg `#09071a`→`#120c28` gradient, hover,
  border, accent, text), deliberately outside the `[data-theme=...]` blocks.
- `components/shell/sidebar.tsx` — rewritten to use the new tokens instead of theme-driven surface
  classes; added a profile footer (avatar/name/email + settings/logout icon buttons) that didn't
  exist before, using real `useAuthStore` data — visible in both reference images.
- `components/shell/topbar.tsx` — new optional `TopbarConfig` (breadcrumb, title, subtitle,
  primaryAction, secondaryText) read from `useShellStore`; the shared search/notifications/locale/
  theme/status controls are unchanged and rendered exactly once. The "Configurações" shortcut link
  now hides on `/settings` itself.
- `stores/use-shell-store.ts` — added `topbarConfig` (transient, never persisted) +
  `setTopbarConfig`.
- `hooks/use-topbar-config.ts` — new hook a page calls once to register its config for its
  lifetime, clearing it on unmount.

**Settings tabs:**
- `app/(app)/settings/page.tsx` — now a thin composition root; sets the breadcrumb
  `["LDCN OS", "FUNDAÇÃO", "CONFIGURAÇÕES"]`, title, and a header-integrated "Salvar alterações"
  button wired to the existing density draft field. The old fixed-bottom `SettingsSaveBar` is
  removed (the reference only shows the button in the header) — `settings-save-bar.tsx` and
  `use-settings-draft-store.ts` deleted as now-unused; `use-settings-draft-field.ts` simplified to
  local component state.
- `components/settings/account-tab.tsx` — rebuilt: profile hero (gradient avatar + a disabled,
  clearly-labeled "coming soon" camera button — no fake photo upload since no endpoint exists),
  3-column grid (Preferências pessoais / Segurança / Gerenciamento de dados), danger zone
  restyled to a 2-row icon+title+description+button layout. Added three genuinely new,
  client-persisted preferences (timezone, date format, time format —
  `stores/use-personal-preferences-store.ts`) since the reference's fields had no backing store;
  deliberately did **not** add email-notification toggles, since no mailer service exists anywhere
  in the backend and a toggle implying real emails would be misleading.
- `components/settings/advanced-tab.tsx` — rebuilt: dev-mode card with a small decorative SVG
  cube illustration; a dark hero panel embedding the *existing* `TopologyGraph`
  (`components/three/topology-graph.tsx`, already used on `/architecture`, real react-three-fiber
  scene) at a smaller size, reusing the same real structural node/edge data
  (frontend/api/backend/database/queues/integrations) rather than inventing new visualization data;
  4 metric cards with real registry counts; an Idioma/Localização card with a purely decorative
  dot-cloud world-map SVG (explicitly not real geo/user-location data — this platform tracks none).
  The registry overview is no longer gated behind Dev Mode (the reference shows it always visible;
  the original text-only spec's "gate internal details behind dev mode" language didn't match the
  actual designed screenshot once provided).
- `components/settings/ai-providers-tab.tsx`, `git-tab.tsx`, `interface-tab.tsx`,
  `runtime-tab.tsx` — visual-consistency pass only (larger `rounded-[1.5rem]` radius, matching
  shadow), no data/logic changes.
- `components/settings/settings-section.tsx` — default styling now bakes in the premium
  radius/shadow so every tab gets it uniformly without per-usage repetition.

## Real bugs found and fixed during verification

1. **`TopologyGraph` needed a `next/dynamic` boundary.** A static import pulled
   react-three-fiber/three.js into Settings' own page bundle; `topology-graph.tsx`'s own comment
   already establishes the "keep Three.js out of first-load JS" discipline for its inner scene —
   extended the same discipline to this new call site.
2. **"Topologia ao vivo" button was invisible in Light theme.** It used the shared `ActionLink`
   `soft` variant, which resolves text/background from theme CSS variables — inside my hardcoded-
   dark hero card, Light theme's dark-on-light variable values became illegible against the dark
   backdrop. Fixed with explicit, theme-independent colors, matching how the rest of that card's
   text was already handled.
3. **`AccountTab`'s `deleteAccount()` had a redundant try/catch** that would have swallowed
   `DeleteResourceButton`'s own error display. `DeleteResourceButton` already owns pending/error
   state and shows a rejection inline in its dialog — let the promise propagate untouched.

## Verification performed

- `npm run typecheck`, `npm run lint` (39 warnings, unchanged baseline, 0 new), `npm run build` —
  all clean. The build's own bundle-budget check was flaky on this machine across repeated clean
  runs (`static chunks total` varied from 4.1MB to 28.6MB between otherwise-identical rebuilds,
  while every individual route's byte count stayed stable and under budget) — confirmed via a
  proper `git stash` comparison that this instability reproduces identically on the pre-session
  baseline, so it's a pre-existing Windows filesystem artifact (likely antivirus-related chunk
  cleanup timing), not something introduced here.
- `apps/web/tests/settings.spec.ts` (7 tests: all tabs render, keyboard nav, theme switching,
  density draft/save round-trip incl. reload persistence, 3 viewports) — all passing.
- Real Playwright screenshots taken and visually compared against both reference images, in both
  Dark and Light theme, at desktop/tablet/mobile widths — structure, spacing, colors, and content
  match closely. Also screenshotted `/dashboard` (an untouched route) to confirm the navy sidebar
  renders correctly everywhere and the Topbar customization stays correctly scoped to `/settings`
  only (the "Configurações" shortcut and default breadcrumb/title both still work normally there).

## Known remaining differences (honesty-over-fidelity, not fixed)

- Account tab's "Segurança" card is visually thinner than the reference (only real password-change
  — no fabricated last-login/device/IP/2FA/active-sessions, none of which exist server-side).
- "Gerenciamento de dados" only has "Exportar meus dados" (real) — the reference's
  download-history/revoke-consent rows are omitted (no backing endpoints).
- A pre-existing, out-of-scope bug was observed (not fixed): the shared `AppShell` skip-to-content
  link visually overlaps page content at tablet/mobile widths in certain states — unrelated to any
  file touched in this pass.
