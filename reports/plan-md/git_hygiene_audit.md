# Git Hygiene Audit

## Scope

Audit after the V1 Foundation root commit to identify temporary and generated artifacts that should not remain versioned.

## Findings

| Category | Tracked files | Approx bytes | Action |
| --- | ---: | ---: | --- |
| ZIP archives | 36 | 96,806 | Remove from Git index and ignore `*.zip` |
| Prepared downloads | 36 | 96,806 | Remove from Git index and ignore `prepared-downloads/` |
| Screenshots/browser profiles | 1,950 | 139,775,724 | Remove from Git index and ignore `reports/screenshots/` |
| Browser runtime report caches | 2,936 | 116,801,537 | Remove from Git index and ignore `reports/cdp-search-profile*/` |
| Test results | 2 | 90 | Remove from Git index and ignore `test-results/` |
| `.log` files | 0 | 0 | Ignore `*.log` |
| `.err` runtime logs | 4 | 291 | Remove from Git index and ignore `*.err` |
| `.pytest_cache` | 0 | 0 | Ignore `.pytest_cache/` |
| Playwright report | 0 | 0 | Ignore `playwright-report/` |

## Keep

The cleanup keeps code, docs, textual reports, contracts, templates, and active source files versioned.

## Do Not Remove From Disk

The cleanup is index-only. Generated artifacts remain on disk for local use unless manually deleted later.
