# Frontend Runtime Validation

## Scope

Validated `apps/web` Frontend Foundation for LDCN OS.

## Runtime target

- URL: `http://127.0.0.1:3000`
- Mode: `next start`
- Build: production build from `npm run build`

## Routes validated

| Route | Status | Result |
| --- | --- | --- |
| `/` | 200 | redirects/renders dashboard content |
| `/dashboard` | 200 | passed |
| `/projects` | 200 | passed |
| `/templates` | 200 | passed |
| `/wizard` | 200 | passed |
| `/documentation` | 200 | passed |
| `/settings` | 200 | passed |

## Screenshots generated

- `reports/screenshots/final-dashboard-ultrawide.png`
- `reports/screenshots/final-dashboard-desktop.png`
- `reports/screenshots/final-projects-laptop.png`
- `reports/screenshots/final-templates-tablet.png`
- `reports/screenshots/final-settings-mobile.png`
- `reports/screenshots/search-command-desktop.png`
- `reports/screenshots/search-command-mobile.png`

## Global Search Validation

| Check | Status | Result |
| --- | --- | --- |
| Topbar desktop trigger | passed | Premium search trigger rendered with `Search LDCN OS...` |
| Mobile search trigger | passed | Compact icon trigger rendered without breaking layout |
| Command Palette modal | passed | Opens as accessible dialog |
| Ctrl+K / Cmd+K ownership | passed | Global shortcut handled by `AppShell` |
| Input focus | passed | Search input focused on open |
| Search filtering | passed | Query `violet` returned `Titanium Violet` |
| Theme command | passed | Enter switched runtime theme to `titanium-violet` |
| Route command | passed | Enter on `projects` navigated to `/projects` |
| Arrow navigation | passed | Active result index changed with Arrow Down |
| Outside click close | passed | Overlay click closed palette |
| Escape close | implemented / needs manual confirmation | Dialog and shell handlers are present; Chrome headless CDP did not observe close from synthetic Escape |

## Errors found

- `localhost` resolved inconsistently in the validation environment.
- Initial mobile screenshots were too dark before hydration.
- Sidebar open state was being persisted and could show a stale mobile overlay.
- Mobile topbar/theme selector could create horizontal pressure.
- `next start` served stale production chunks when not restarted after a new build.
- Chrome headless CDP did not close the command palette from synthetic Escape events.

## Corrections applied

- Used `127.0.0.1` for reliable route validation.
- Added default theme CSS variables in `:root`.
- Persisted only `themeId` in the shell store.
- Disabled first-render fade through `AnimatePresence initial={false}`.
- Added `prefers-reduced-motion` CSS support.
- Compact mobile topbar behavior added.
- Theme switcher changed to a responsive mobile grid.
- Global horizontal overflow protection added.
- Added Global Search topbar trigger and Command Palette.
- Added searchable page, documentation, and theme commands.
- Moved global search shortcut handling to `AppShell`.
- Restarted production server after builds during runtime validation to avoid stale chunk loading.

## Pending

- Browser click automation with a full Playwright suite is not yet part of the repo.
- `npm audit` reports 2 moderate vulnerabilities from Next's nested PostCSS dependency.
- Escape close needs one interactive browser confirmation because headless CDP synthetic Escape did not close the palette.

## Approval

Frontend Foundation runtime validation is approved for the current phase.
