# Git Repository Cleanup

## Summary

Git hygiene cleanup removed temporary/generated artifacts from the Git index without deleting files from disk.

## Updated Ignore Rules

`.gitignore` now covers:

- Python caches and `.pyc`
- `node_modules/` and `.next/`
- Playwright reports and test results
- logs (`*.log`, `*.err`, `logs/`)
- prepared downloads and downloads
- runtime temp directories
- screenshots
- browser runtime report caches
- ZIP archives
- OS metadata

## Removed From Git Index

| Category | Result |
| --- | --- |
| `.pytest_cache` | No tracked files found; ignored |
| `reports/screenshots` | Removed from index |
| `test-results` | Removed from index |
| `apps/web/test-results` | Removed from index |
| `playwright-report` | No tracked files found; ignored |
| prepared download ZIPs | Removed from index |
| runtime `.err` logs | Removed from index |
| `reports/cdp-search-profile*` browser caches | Removed from index |

## Post-Cleanup Validation

Tracked file checks after cleanup:

- `*.zip`: 0
- `reports/screenshots/*`: 0
- `reports/cdp-search-profile*/*`: 0
- `*test-results*`: 0
- `*.log`: 0
- `*.err`: 0
- `*prepared-downloads*`: 0
- `*playwright-report*`: 0
- `.pytest_cache/*`: 0

## Files Kept

The cleanup keeps source code, docs, textual reports, contracts, templates, frontend tests, backend tests, and V1 Foundation runtime code.

## Notes

The cleanup is staged as Git index changes. It should be committed as a hygiene commit after review.
