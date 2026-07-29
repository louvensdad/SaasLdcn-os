# Promise vs Reality

| Promise (marketing / CLAUDE.md) | Reality (proven in code) | Risk |
|---|---|---|
| "Descreva sua ideia e a IA entende o negócio" | Orchestrator LLM extracts a `ProjectSpec` **only with a key**; no key → hardcoded spec (`mock_adapter._build_project_spec`) identical for every idea | **CRITICAL** (no key) / OK (key) |
| "A IA estrutura e gera o PromptMaster.md" | The `.md` is a **deterministic 32-section template** (`prompt_master_md_engine`); LLM never authors it | **HIGH** |
| "PromptMaster profissional e único por projeto" | Measured **97.5–97.9% identical** across 3 very different ideas in the default path | **CRITICAL** (no key) |
| "AI Project Room — conversa com arquiteto IA" | Not a conversation: spec-extraction + **templated** transcript (`_summary`) + templated doc | **HIGH** |
| "Meta-Fábrica: 8 agentes especialistas geram o software" | Real **6-role** LLM pipeline with strong prompts **(with key)**; mock skeletons without; no standalone Architect/DB/Security agents | **MEDIUM** (overstated) / OK (key) |
| "Builders para SaaS/Blog/Marketplace/E-commerce…" | No per-vertical builders exist; one generic pipeline + 2 static template engines | **HIGH** (vaporware) |
| "Modernize: IA analisa todo o codebase" | Analysis is **deterministic** (regex scan + heuristic scores); LLM only optionally rewrites one narrative sentence | **MEDIUM** |
| "Modo determinístico quando não há LLM (nunca finge IA)" | True and well-implemented — `degraded`/"Modo Determinístico" everywhere | **OK** (this is honest) |
| "Auto-repair / quality gate inteligente" | Deterministic by design (correct for a gate), no AI — but not "intelligent" | **LOW** (acceptable, just mislabeled) |
| "Geração adapta entidades/workflows/arquitetura ao domínio" | With key: yes (LLM). No key: identical skeleton — mock entities = `["Item","User"]` for all 3 test domains → byte-identical files except name | **CRITICAL** (no key) |

## One-line truth
**The platform is a real AI product when a key is configured, and a deterministic template
builder when it is not — and several headline "builders" don't exist at all.** The honesty layer
(`degraded`) is genuinely good; the marketing is ahead of the default reality.

## UPDATE (audit follow-ups #1–#4)
- "IA entende o negócio" / "gera o PromptMaster" — **now true when AI is available**: the
  PromptMaster is LLM-authored (server key OR user key), not a template; a global badge shows
  **Modo IA Real vs Preview Determinístico** so the user always knows which they are getting.
- "adapta ao domínio" — the pipeline is now **vertical-aware** (`system_type`).
- "8 specialist agents / 11 builders" — still overstated; documented honestly (one vertical-aware
  AI pipeline + template engines). See `reports/audit_followups_1_4.md`.
