# Frontend i18n Validation

- Four local dictionaries are bundled with the frontend.
- `useLocale` resolves keys with selected locale, configured fallback, then `en-US`.
- Topbar and Settings expose language selectors.
- Interface locale persists with Zustand storage.
- Settings, LDCN presence, and wizard-critical actions use translation keys.
- TypeScript typecheck: passed.
- Playwright localization coverage added in `apps/web/tests/localization.spec.ts`.
- Playwright localization validation: 2 passed.
- Next.js production build: passed.
