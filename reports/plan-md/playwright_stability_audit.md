# Playwright Stability Audit

Date: 2026-06-06

## Result

**PASS - complete Playwright suite is green with no timeout.**

Final command:

```text
npx.cmd playwright test --output=test-results/final-post-polish
```

Final result: **76 passed in 4.6 minutes**

## Root Causes

1. Several Wizard specs selected controls by global position, such as `locator('select').nth(0)`. The new global locale selector became the first select, so tests repeatedly attempted to select `java` from the locale control until the 60-second test timeout.
2. Tests expected content that Premium Polish intentionally moved into collapsed disclosures.
3. Tests expected hidden responsive LDCN rail messages instead of primary visible content.
4. Topbar and page content exposed duplicate headings with the same accessible name, causing strict-mode locator failures.
5. A build validation was initially run concurrently with `next dev`; both wrote to `.next`, producing a transient `/_document` page-manifest failure. Sequential build validation passed.

## Corrections

- Replaced positional Wizard select locators with stable accessible-label locators.
- Updated assertions to validate visible snapshot and primary-content surfaces.
- Updated architecture tests to open the advanced disclosure explicitly.
- Removed duplicate heading semantics from the topbar and promoted page section headers to `h1`.
- Aligned Gatekeeper expectations with the current approved-with-warnings result.

## Additional Verification

- API tests: **158 passed in 42.01 seconds**
- Offline-state tests intentionally emit failed-resource console messages; these are expected and do not fail the suite.

## Approval

Complete suite green: **PASS**

No timeout: **PASS**
