# Localization Select UI Validation

## Scope

The shared native select styling now uses active-theme tokens for control background, foreground, border, hover, selected option, and focus ring.

Validated surfaces:

- Topbar locale selector
- Settings interface language selector
- Generated project language selector
- Documentation language selector
- Code comments language selector
- Fallback language selector

Validated options:

- Português
- English
- Español
- Français

## Implementation

- Added opaque native-control tokens per theme to prevent operating-system white dropdown fallback.
- Applied global native `select`, `option`, hover, checked, disabled, and focus-visible rules.
- Updated shared `Select` and remaining direct native selects in Skills and Templates.
- Added automated contrast and white-background regression coverage.

## Acceptance

- No localization dropdown uses a white background outside the theme.
- Option foreground/background contrast is required to meet WCAG AA `4.5:1`.
- All four language labels must remain present and readable.

## Results

- Google Chrome: passed
- Microsoft Edge: passed
- Firefox: passed
- Five active themes validated
- Six localization selectors validated per theme
- Four locale options validated per selector
- TypeScript typecheck: passed
- Next.js production build: passed
