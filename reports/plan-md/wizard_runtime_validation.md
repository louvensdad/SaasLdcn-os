# Wizard Runtime Validation

Date: 2026-05-20

## Static Validation

- `npm run build`: passed
- `npm run typecheck`: passed
- `npx tsc --noEmit`: passed after clearing stale `tsconfig.tsbuildinfo`

## Runtime Validation

Frontend runtime:
- `http://127.0.0.1:3000/wizard`: healthy

Backend runtime:
- `http://127.0.0.1:8001/api/health`: healthy during online validation

## Playwright Validation

Online:
- `npx playwright test tests/registry-online.spec.ts --reporter=line`: passed

Validated online behaviors:
- user selects language
- runtime appears after language
- framework appears after runtime
- architecture appears after framework
- archetype appears after architecture
- capabilities appear after archetype
- modules appear after capabilities
- endpoints appear grouped by module
- blueprint preview updates live
- validation completes successfully
- command palette lists real registry items
- mobile viewport shows no horizontal overflow

Offline:
- `npx playwright test tests/registry-offline.spec.ts --reporter=line`: passed with backend intentionally stopped

Validated offline behavior:
- Wizard does not crash when backend is unavailable
- explicit offline/error state remains visible

## Screenshots

- `reports/screenshots/wizard-progressive-desktop.png`
- `reports/screenshots/wizard-progressive-mobile.png`

## Notes

- A stale TypeScript incremental cache caused the first standalone `tsc` pass to report missing `.next/types` files even though the build output existed.
- Removing `apps/web/tsconfig.tsbuildinfo` resolved the standalone typecheck without requiring source changes.
- No generation, AI, or agent implementation was added during this validation pass.
