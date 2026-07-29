# LDCN OS - P2 Remediation Report

Date: 2026-07-15
Scope: AUD-014 through AUD-019 only. AUD-020 (P3) was not modified.

## Result

P2 controls are implemented and executable. The backend measured 88% coverage with 1,023 passing tests. Frontend typecheck, lint budget, typography, locale/i18n regression gates, Axe smoke, bundle budget, dependency audits, and hotspot budgets are automated.

## AUD-014 - Frontend quality

- ESLint now runs on aligned Next 15 configuration and fails above the explicit 39-warning baseline.
- Typography audit is blocking; current result is zero violations.
- Hardcoded i18n audit is blocking on regression; current baseline is 195 findings in 17 files.
- Locale placeholder parity is enforced. Missing translations cannot increase beyond 318 keys per `en-US`, `es-ES`, and `fr-FR`.
- Axe Playwright smoke blocks serious/critical WCAG findings on `/login`.
- CI runs the frontend audits and E2E smoke.

Controlled debt: existing hardcoded strings and missing translations were not replaced with fake translations. Their baselines remain visible and can only decrease.

## AUD-015 - Hotspots

- Generation pipeline states, immutable step policy, mobile insertion policy, and logical-stage derivation moved to `app/engines/generation_pipeline_policy.py` with focused tests.
- Existing imports remain compatible through engine reexports.
- Seven audited hotspots have exact line-count ceilings in `check-hotspot-budgets.mjs`; growth fails CI.

Controlled debt: the large wizard, Meta-Factory page/route, framework specialist, build validator, and mock adapter still require incremental feature-boundary extraction. The gate prevents further growth.

## AUD-016 - Dependencies

- Next and `eslint-config-next` are pinned to 15.5.18; ESLint is pinned to 9.39.5.
- Python runtime/dev locks include hashes; Docker runtime installs with `--require-hashes`.
- `pip-audit` is locked and runs in CI. Runtime Python audit reports no known vulnerabilities.
- npm high/critical gate passes. Two moderate PostCSS findings remain inside Next; npm proposes an unsupported breaking downgrade, so no forced remediation was applied.

## AUD-017 - LLM cache

- Cache operations use an `RLock`, monotonic TTL, LRU entry and byte budgets, oversized-entry rejection, policy-versioned tenant namespace keys, and metrics for events/entries/bytes.
- Concurrency, TTL, byte, namespace, and policy-key behavior is covered by tests.

## AUD-018 - Tests

- Pytest profiles cover integration, contract, security, slow, and enterprise execution.
- Coverage gate is 87%; measured result is 88%.
- Ephemeral PostgreSQL, Redis, and MinIO round-trip contracts run in CI.
- A dedicated adversarial job covers sandbox execution, terminal isolation, artifact/ZIP/URL handling, tenancy/auth security, and secret redaction.

## AUD-019 - Build

- `allowJs` is disabled and strict typecheck passes.
- `skipLibCheck` remains enabled because `@react-three/postprocessing` currently publishes an unresolved `N8AOPostPass` declaration and generated Next directories conflict under full library checking.
- Existing 3D scenes are dynamically imported behind client boundaries.
- Production builds enforce route and total static chunk budgets. Measured largest route is wizard at 1,491,661 raw bytes; total static chunks are 4,105,637 bytes.

## Validation evidence

- Backend: 1,023 passed, 1 skipped, 4 deselected; 88% coverage.
- Pipeline policy regression: 18 passed.
- LLM cache/metrics: 20 passed.
- Axe login smoke: 1 passed.
- Frontend lint: 0 errors, 39 warnings within baseline.
- TypeScript: passed with `allowJs=false`.
- Production Next build: compiled and generated 27 static pages; bundle budget passed after manifest validation.
- Typography: 0 violations.
- Python dependency audit: no known vulnerabilities.
- npm audit: 0 high/critical, 2 moderate.