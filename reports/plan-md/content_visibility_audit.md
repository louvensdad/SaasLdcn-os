# Content Visibility Audit

Date: 2026-06-07

## Resolved

- Wizard right rail now occupies a full-width row below `2xl` instead of becoming a narrow wrapped grid item.
- Wizard center, step cards, right rail, Framework Specialist, Engineering Readiness, cards, and disclosures now use `min-w-0`.
- Shared cards use `overflow-wrap:anywhere` for long technical identifiers and translated copy.
- Removed content-level `overflow-hidden` from shared disclosures, Framework Specialist, Engineering Readiness, and LDCN rail surfaces.
- No internal `max-height` or forced scroll container was introduced for Wizard information.

## Automated Validation

The responsive Playwright audit checks:

- Document horizontal overflow.
- Scroll/client dimensions of audited Wizard containers.
- Visibility of the Blueprint Preview and localized critical content.

Result: PASS on desktop, tablet, and mobile.
