# Audit Follow-ups #1–#4 — what shipped

Implements the four remaining gaps from `final_premium_audit.md`. Honest scope: #1/#3 fully
backend; #2 a focused premium pass (Project Room + global badge), not a full app redesign; #4 a
real-but-light vertical awareness + honest docs.

## #1 — AI as the default (not the fallback)
- **Bug fixed:** the new PromptMaster/Architect authoring only fired on a *user* key, so a
  configured **server** key still produced deterministic docs. Now `author_prompt_master_md` and
  `architect_engine.build_blueprint` author via the LLM whenever **AI is available** (server key
  OR user key), with the `served_by_fallback → deterministic` safety net intact.
- `services/ai_availability.py` (`ai_available()` / `ai_status()`): real provider = any of
  `ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_API_KEY / OPENROUTER_API_KEY` or a custom base URL
  (Ollama's default localhost excluded to avoid a false positive).
- `GET /api/ai-status` → `{ ai_active, mode: "ai" | "deterministic_preview", providers }`.
- **Honest by default:** with no server key it is plainly labelled "deterministic preview".

## #2 — Premium Project Room + global AI badge (frontend)
- `components/shell/ai-mode-badge.tsx` in the topbar: **Modo IA Real** vs **Preview
  Determinístico** (consumes `/ai-status`, tooltip lists providers).
- Project Room redesigned: a **status stepper** (Descoberta → PromptMaster → Blueprint → Geração),
  a new **"Gerar Blueprint"** action after approval, and a **blueprint panel** rendering the
  Architect's justified decisions. Contract/client/i18n updated. No other screens touched.

## #3 — Modernize pipeline state persisted (SQLite)
- `repositories/modernize_job_repository.py`: owner-scoped `modernize_jobs` table (JSON blob,
  redacted) replaces the in-memory `_JOBS` dict; initialized in the lifespan; bound per-test in
  conftest. The report/plan/approval/scores/refactor **survive a process restart**.
- `codebase_ingest_service.root_for` now reconstructs the sandbox path from disk, so a persisted
  job stays actionable after restart.

## #4 — Vertical-aware pipeline + honest docs
- `ProjectSpec.system_type` added; the deterministic fallback sets it per domain (SaaS de saúde,
  Marketplace, E-commerce, …) and the orchestrator prompt infers it. `system_type` flows into the
  Architect blueprint justification and the compiled Mega-Prompt, so agents get the **vertical**,
  not just free text.
- Honest docs: `builder_truth_audit.md` and `promise_vs_reality.md` updated — the platform is
  **one AI pipeline (now vertical-aware) + template engines**, not 11 distinct builders.

## Tests (all green; full suite kept passing)
- `test_items_1_to_4.py`: ai-status shape/deterministic/active; PromptMaster authored by LLM when
  AI available (server-key default); Modernize job persists across repo instances + owner-scoped.
- `test_prompt_master_authoring.py`: `system_type` differs per domain (item 4).
- Existing Modernize/Room suites pass on the persisted store.

## Honest limits (unchanged)
- #2 is the Project Room + badge only; the rest of the UI is unchanged.
- #1 makes AI the default **when a server key is configured**; otherwise honest preview.
- #4 is a light vertical opinion, not 11 bespoke builders.
