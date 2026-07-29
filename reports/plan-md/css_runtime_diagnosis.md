# CSS Runtime Diagnosis

## Symptom

The frontend intermittently rendered as raw HTML with minimal styling, white background, and broken layout.

## Diagnosis

The CSS pipeline itself was intact in source:

- `apps/web/app/layout.tsx` still imports `./globals.css`
- `apps/web/app/globals.css` still includes `@import "tailwindcss";`
- `apps/web/postcss.config.mjs` remains valid

The actual failure was runtime/cache related:

- The dev server served stale `.next` assets.
- At one point the CSS asset returned `404`.
- After cache reset, the CSS asset returned `200`.
- A concurrent `next dev` plus `next build` sequence produced a broken runtime chunk state on `/settings`.

## Evidence

- `/_next/static/css/app/layout.css` now returns `200`
- All main routes now return `200`
- Production build passes when `next dev` is stopped
- Playwright validation on the wizard passes after a clean dev restart

## Resolution

The fix was operational, not code-level:

1. Stop the stale dev server.
2. Clear `.next` and `tsconfig.tsbuildinfo`.
3. Run `next build` in isolation.
4. Start `next dev` again.

## Outcome

- Dark premium theme is back
- Sidebar and topbar render correctly
- Cards and shell styling are restored
- No raw HTML fallback is visible in the validated routes
