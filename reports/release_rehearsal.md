# LDCN OS - Local Release Rehearsal

Date: 2026-07-15
Environment: Docker Desktop 4.72.0, Linux engine 29.4.2.

## Result

The container, E2E, infrastructure, and sandbox gates passed locally. The full-history secret scan was remediated after credential rotation, browser-profile removal, and a controlled force-push; the fresh remote clone now passes with zero findings. No test containers or temporary smoke scripts remained after cleanup.

## Container builds

| Image | Result | Runtime user | Local image ID |
|---|---|---|---|
| `ldcn-api:release-check` | Passed | `10001:10001` | `sha256:4dd2065f3c8bf7d46c926738995abcb601e4558affcc3d044abe81fe7efd933e` |
| `ldcn-web:release-check` | Passed, including production Next build, bundle budget, and removal of package managers from runtime | `10001:10001` | `sha256:11ed74f3e3d5c3942451b235a6b6274538020f3a3a5337acf05f834d624d9f0b` |
| `ldcn-sandbox:release-check` | Passed | `65532:65532` | `sha256:87061e30cf77036db54fd734d1cfef1885f3357fec114995ced9b62d8ea565b5` |

These are local image IDs, not signed registry digests. Production images must still be pushed, vulnerability-scanned, signed and pinned by immutable registry digest.

## E2E smoke

Playwright executed the CI smoke selection:

- login Axe WCAG scan: no serious or critical violations
- Project Room request sends the selected delivery type
- selector defaults and active state
- persistence for `web`, `backend`, `mobile` and `full_stack`

Result: 7 passed in 56.1 seconds. The launcher migrated a fresh isolated database through `20260715_j1_download_records`.

## Infrastructure contracts

Ephemeral containers used alternative localhost ports and were removed in a `finally` cleanup:

- PostgreSQL 16: `SELECT 1` transaction passed
- Redis 7: namespaced set/get/delete passed
- MinIO release `2025-04-22T22-12-26Z`: bucket/object round trip passed

Result: 3 passed in 2.96 seconds.

## Real sandbox smoke

The production `SandboxExecutionRuntime` opened an ephemeral container from the built sandbox image, copied a single-file project workspace, executed Python without a shell, and closed the session.

Observed output:

```text
status=SUCCEEDED
exit_code=0
uid=65532
file=isolated
network_blocked=True
```

A post-run Docker query found no remaining LDCN sandbox container.

## Supply-chain gates

Trivy 0.66.0 scanned the three final local images for fixable `HIGH` and `CRITICAL` vulnerabilities with the 2026-07-15 vulnerability database:

| Image | Critical | High |
|---|---:|---:|
| `ldcn-api:release-check` | 0 | 0 |
| `ldcn-web:release-check` | 0 | 0 |
| `ldcn-sandbox:release-check` | 0 | 0 |

The first web scan found `CVE-2026-33671` in `picomatch` and `CVE-2026-48815` in `sigstore`, both supplied by the global npm installation in the Node runtime base. The final web stage does not install dependencies, so npm, npx, and corepack were removed from that stage. A clean rebuild and rescan returned zero findings.

Gitleaks 8.28.0 initially found 146 historical candidates. After operator-confirmed rotation, 53 exact browser-profile paths were removed from all published refs; six synthetic fixture findings are covered by the narrow `.gitleaks.toml` policy. A fresh clone of the published remote scanned 66 commits and returned zero findings. The redacted initial report remains outside the repository at `C:\tmp\ldcn-gitleaks\report.json`; the final report is at `C:\tmp\ldcn-gitleaks\remote-final.json`.

No allowlist was added and Git history was not rewritten. Detailed classification and the controlled response order are recorded in `reports/historical_secret_triage.md`.
## Remaining external gates

- Run the committed GitHub Actions workflow from a clean checkout.
- Re-run gitleaks in CI after historical finding triage, credential rotation, and approved history remediation.
- Repeat the clean local image result in the registry scanner against pushed immutable digests.
- Sign and attest images, then deploy by immutable digest.
- Validate the production egress proxy and approved registry allowlist.
- Perform backup/restore and rollback rehearsal against production-like managed services.