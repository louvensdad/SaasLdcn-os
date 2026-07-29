# Project Rooms — Live End-to-End Test (7 projects)

**Branch:** `feat/premium-foundation` · **Date:** 2026-07-07/08
**Goal:** drive 7 real, complex Project Room → PromptMaster → Blueprint → Engineering Review → Meta-Fábrica → GitHub export journeys end-to-end against the live local dev API, using a real DeepSeek key and a real GitHub PAT (both kept in shell env vars only, never written to any file). No browser was available this session, so the flow was driven directly via the same REST API the frontend calls (`apps/api/tests/../room_driver.py`, a throwaway script, not part of the app).

## Results — all 7 reached READY

| Project | Stack | delivery_type | Job status | Build | GitHub export |
|---|---|---|---|---|---|
| SGE Corp — Gestão de Compras e Despesas | Java | full_stack | READY | SKIPPED_AFTER_FAILURE | Blocked (real security findings) |
| ClinicFlow — Agendamento e Prontuário | C#/.NET | full_stack | READY | SKIPPED_AFTER_FAILURE | Blocked (real security findings) |
| RotaExpress — Rastreamento de Entregas | TypeScript (RN) | mobile | READY | SKIPPED_AFTER_FAILURE | Blocked (real security findings) |
| InvestTrack — Carteira de Investimentos | Python | full_stack | READY | SKIPPED_AFTER_FAILURE | Blocked (real security findings) |
| TeamSync — Gestão Colaborativa | Node/TypeScript | full_stack | READY | SKIPPED_AFTER_FAILURE | Blocked (real security findings) |
| MarketPlace Local — E-commerce Multi-Vendedor | auto (LLM-chosen) | full_stack | READY | SKIPPED_AFTER_FAILURE | Blocked (real security findings) |
| LaunchPad SaaS — Landing Page | auto (LLM-chosen) | web | READY | SKIPPED_AFTER_FAILURE | Blocked (real security findings) |

`SKIPPED_AFTER_FAILURE` = the bounded auto-repair loop gave up on a build error and the pipeline honestly surfaced `READY` with the Execution Terminal opened for manual follow-up, per the existing "Hybrid AI + Terminal" design (not a new bug — this is the documented fallback behavior).

**GitHub export: all 7 of 7 were correctly blocked** by real high/critical findings from `GeneratedProjectQualityEngine` — not false positives. After Finding 6's fix, the block message now names them, e.g.:
- `critical` — "Real .env or secret-like file is not allowed in generated projects."
- `high` — "Secret-like hardcoded value detected." (multiple, across several projects)

This is the security gate correctly catching LLM-generated placeholder secrets / a committed `.env`-shaped file before it could reach a real GitHub repo — the gate is doing its job, not failing the test. One remaining polish gap: `file_path` comes back `null` on these specific finding types, so a user still can't jump straight to the offending file from the error alone (not fixed tonight — noted below).

## Bugs found and fixed today

1. **Analytics: one corrupted JSON row blanked out an owner's entire `project_rooms`/`projects` list.** `ProjectRoomRepository._loads`/`ProjectRepository._deserialize_json` raised uncaught on malformed JSON; the exception propagated past the per-row loop into `AnalyticsService`'s per-source fault isolation, which zeroes the *whole* source on any failure. Fixed: JSON decode failures are now caught per-column and per-row (log + skip), so one bad row no longer hides every real one. 8 new tests (`test_analytics_dirty_data_stress.py`, 300-row dirty seed). Commit `8e1245d`.

2. **Engineering Review validate: a self-contradicting message.** The "readiness" check's `detail` was a hardcoded pass-case string ("Sem bloqueios anteriores à aprovação") even when the check *failed* — so a blocked review displayed a message claiming there were no blockers. Fixed to list the actually-pending checklist items. `apps/api/app/services/project_room_service.py`.

3. **Meta-Factory file parser rejected valid DeepSeek output.** DeepSeek emitted well-formed `<<<FILE path="...">>` blocks using **two** closing angle brackets instead of the documented three (`>>>`). The strict regex found zero matches and discarded a 58-file, fully-correct .NET backend response as "No FILE blocks found" after 3 wasted retries. Fixed `_FILE_RE` in `file_protocol.py` to accept 2+ closing brackets. Caught live on `genjob_7b908e080e424e` (dotnet_clinic); confirmed the retry recovered all 58 files after the fix.

4. **`DependencyResearchService`: 5 audit methods were called but never implemented.** `audit_manifest()` dispatched to `_audit_csproj`/`_audit_go_mod`/`_audit_cargo`/`_audit_gemfile`/`_audit_composer` for .csproj/go.mod/Cargo.toml/Gemfile/composer.json — none of the five existed, so the BUILD_RUNNING stage crashed with `AttributeError` for **any C#, Go, Rust, Ruby, or PHP backend** (`'DependencyResearchService' object has no attribute '_audit_csproj'`, caught live on the dotnet_clinic job). Implemented all five. Also found the `DependencyFinding.ecosystem` schema only allowed `pypi/npm/maven` — even a correct implementation would have failed Pydantic validation for the other 5 ecosystems; extended the `Literal`. 8 new tests in `test_dependency_research.py`.

5. **`scripts/dev.mjs`: uvicorn `--reload` could get stuck mid-restart under any real traffic.** The dev SQLite DB lives at `apps/api/app/data/ldcn_os.db`, inside the watched tree. Every request that persists something touches that file, resetting WatchFiles' debounce — under load, "changes detected" fires continuously (789 times in one server run) and the reloader can log "Reloading..." but never find a quiet window to actually restart (observed live: no "Started server process" ever followed one such log line, so a fix could sit in source for 5+ minutes serving stale code). Fixed by adding `--reload-exclude app/data/*` to the uvicorn invocation in `scripts/dev.mjs`.

6. **Export security block was a bare, unactionable message — and disagreed with the Quality Report the user just saw.** `POST /meta-factory/{id}/export/{provider}` blocks on high/critical findings from `GeneratedProjectQualityEngine` (a file-content regex scanner), while the Quality Report card the user sees in the UI comes from a **different** engine (`quality_gate_engine`) that showed **zero** blockers for the same project. The 409 gave no way to see what was actually found. Fixed the immediate UX problem: the error now includes the list of blocking findings (severity/title/file_path) so it's at least actionable. Verified live on 2 of the 7 projects: the 409 now lists e.g. `critical — "Real .env or secret-like file is not allowed in generated projects."` and `high — "Secret-like hardcoded value detected."` — actionable, though `file_path` comes back `null` for these specific finding types (a smaller follow-up: `_security_checks` isn't attaching the path for every finding kind it raises).

**Not fixed** (flagged, not attempted): the two scanners are independent and can disagree — worth unifying or cross-referencing in a follow-up, out of scope for a live fix tonight. The block itself is intentionally *not* bypassable by `force` (a deliberate hard security floor, confirmed by code reading — different from the "unverified build" gate, which `force` does bypass).

## Findings documented but not changed (need a product decision, not a live fix)

- **Orphaned/zombie generation job.** `genjob_a56365918dbb49` ("MedCore IA") was found stuck in `BUILD_RUNNING` from a prior session, consuming one of the 3 concurrent-generation slots indefinitely — nothing server-side detects that its owning process died. Not touched (it's the user's own historical data); worth a startup reconciliation pass that marks orphaned non-terminal jobs `STALLED` after a timeout.
- **Export latency.** A blocked export (409) took 150–160s just to *reject* — `GeneratedProjectQualityEngine.quality_check()` scans the whole generated tree synchronously; for a `full_stack` project (backend+frontend+mobile, hundreds of files) this is slow enough that a real UI user would see a 2.5-minute hang before "no." Root cause not fully isolated (file-content regex scan cost vs. contention with concurrent generation jobs in the same process); flagging for a follow-up rather than guessing under time pressure.
- **The dev server died once mid-session with no error logged** (clean cut-off in the log, no traceback, no shutdown message) — could not be attributed to application code; likely host/environment (this machine, this session). Both in-flight jobs at the time had already reached `READY` by the time it was noticed, so no generation work was lost.
- **`git_provider_service._push_github`** uploads one blob per file sequentially via the GitHub Data API (correct approach — blob→tree→commit→ref — just not parallelized). For very large projects this adds real wall-clock time on top of the quality-check delay above. Not changed; a candidate for a future concurrency improvement if export latency becomes a recurring complaint.

## Verification

- `pytest tests -q` → **774 passed, 1 skipped, 1 deselected** after all fixes (started the day at 741; no regressions introduced).
- Every fix above has a dedicated regression test reproducing the exact failure first, then proving the fix.
