# Wizard Cinematic Refactor

## Summary
- Reframed the Wizard from a form-like flow into an architecture journey.
- Added a visible topology surface, readiness signals, and layered command surfaces.
- Kept the existing wizard steps, labels, and backend integration intact.

## Validation
- `npm run typecheck` passes.
- `npm run build` passes.
- Mobile overflow validation passes.
- The online wizard flow passes.

## Remaining Test Risk
- Some blueprint-preview and offline Playwright assertions still need follow-up work around visibility of specific preview-state texts.

