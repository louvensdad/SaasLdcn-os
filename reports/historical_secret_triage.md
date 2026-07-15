# LDCN OS - Historical Secret Triage

Date: 2026-07-15
Scanner: Gitleaks 8.28.0, full Git history
Status: **Remediated; post-rotation monitoring required**

## Scope and safety

The scan returned 146 redacted candidates across three commits. The current worktree returned zero findings. This report intentionally contains no detected secret values. The redacted machine-readable evidence remains outside the repository at `C:\tmp\ldcn-gitleaks\report.json`.

Credential rotation was confirmed by the operator before this procedure. A narrow `.gitleaks.toml` allowlist now covers only the five synthetic fixture patterns and one natural-language fixture. The authorized history rewrite and force-push were completed after validation.

## Classification

| Class | Findings | Files | Initial disposition |
|---|---:|---:|---|
| Historical Chrome profile captures | 140 | 53 | Treat as potentially exposed browser sessions, extension state, OAuth material, and API credentials. Rotation/revocation required before history cleanup. |
| Test fixtures | 5 | 4 | Likely synthetic detector fixtures; validate with owners, then use narrowly scoped fingerprint/path allowlisting only if proven non-secret. |
| Application source text | 1 | 1 | Likely natural-language false positive; validate against the historical blob before any exception. |

Rule totals: 142 `generic-api-key`, three `stripe-access-token`, and one `gitlab-pat`.

## Historical reachability

| Commit | Findings | Reachable references |
|---|---:|---|
| `08aa9e4a3b3941d5992ce4920d8a15166095ffd3` | 1 | local and `origin/feat/premium-foundation` |
| `c5b7f37ff681b40a26110ac94a1a81b0d6a44a0d` | 4 | local and `origin/feat/premium-foundation` |
| `2a59233d6fc31c7145d7c04ddb03d2850553a0bf` | 141 | local `feat/premium-foundation`, local `master`, `origin/feat/premium-foundation`, and tag `pre-premium-baseline` |

The remote is `https://github.com/louvensdad/sistema-de-engenharia-enterprise.git`. Rewriting only the feature branch would leave at least one affected commit reachable from `master` and the tag.

## Required response order

1. Freeze merges and releases from affected references.
2. Revoke browser sessions represented by the captured Chrome profiles.
3. Rotate provider/API credentials that may have been present in that browser state, including GitHub/GitLab, Stripe, LLM providers, cloud consoles, registries, and OAuth applications as applicable.
4. Review GitHub audit logs and provider logs from the first affected publication through rotation; escalate anomalous access as a security incident.
5. Have code owners classify the six non-browser findings as synthetic or real without copying their values into tickets or chat.
6. Create an offline mirror backup with restricted access and retention approval.
7. Rewrite every affected branch and tag using a reviewed path-removal manifest; do not use broad regex replacement for source fixtures.
8. Force-push only during a coordinated maintenance window, invalidate open PR branches as needed, and require every contributor to re-clone rather than merge old history.
9. Re-run Gitleaks against `--all` history from a fresh clone and require zero unapproved findings.
10. Re-run build, tests, SBOM/container SCA, signing, and release gates on the rewritten commit graph.

## Proposed removal manifest

Remove historical browser-profile trees under:

- `reports/screenshots/**/Default/`
- `reports/cdp-search-profile*/**`

The manifest must be generated from the 53 exact paths in the redacted scanner report and reviewed before execution. Screenshot image artifacts should be retained only when they are actual image files, not directories named with image extensions that contain browser profiles.

## Execution evidence

- External bare backup: `C:\tmp\ldcn-history-backup-20260715-085556.git`.
- Browser-only rewrite removed 53 exact paths; application and test files were preserved.
- Gitleaks on the rewritten clone: 0 findings across 66 commits.
- Fresh clone of the published remote: 0 findings across 66 commits.
- Published `feat/premium-foundation`: `72a68020c0f6a37b8c863e2227afa771f23fb655`.
- Published `master`: `9d71ecbd99b612d7806e96d2740ee28f73c02b32`.
- Published `pre-premium-baseline`: `9d71ecbd99b612d7806e96d2740ee28f73c02b32`.

## Approval boundary

History rewriting changes commit IDs and requires force-pushing published branches/tags. It is destructive for collaborators and will not be executed from the current dirty working tree. The required approval was received. Keep the external backup under restricted retention until incident review and rollback obligations expire.
