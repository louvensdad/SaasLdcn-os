# LLM Visual Gate Coverage

**Branch:** `feat/premium-foundation` · **Date:** 2026-06-28
**Validation:** frontend `tsc --noEmit` clean · `next build` clean (24/24 routes) · backend LLM tests 29/29 green.

## Goal
Every visible AI action reads the global provider from Settings (`useActiveLlm()`) and either (a) confirms via `LlmConfirmationGate` before running, or (b) shows the active provider inline. No screen asks for a key again when a valid provider already exists.

## Legend
- **Gate** — `LlmConfirmationGate` shown before the action (confirm provider / deterministic).
- **Inline** — active provider shown via `LlmProviderInline` badge (visibility, no separate gen step).
- **Upstream** — the AI generation happens in an earlier, already-gated stage; this screen consumes the result.
- **Pending** — action exists but is not yet individually gated (tracked follow-up).

## Coverage matrix

| Module | Action | State | Mechanism |
|--------|--------|-------|-----------|
| **Project Room** | Gerar PromptMaster | ✅ Gate | `capability=prompt_master_generation` |
| | Revisar / Regenerar / Melhorar PromptMaster | ✅ Server-resolved | runs via resolver; room self-updates |
| | Análise profunda (arquitetura) | ✅ Gate | `DeepAnalysisPanel capability=architecture_deep_analysis` |
| | Enviar para Architect | n/a (navegação) | — |
| **Architect** | Gerar Blueprint | ✅ Gate | `capability=architecture_blueprint` |
| | Regenerar Blueprint com IA | ✅ Gate | `capability=architecture_blueprint` |
| | Decisões profundas / reavaliar stack | ✅ Upstream | via deep-analysis gate in room |
| **Engineering Review** | Gerar/Reavaliar Review, parecer, readiness, recomendações | ✅ Upstream | review assessment generated in the gated Architect/room pipeline; this screen approves/handoffs |
| **Documentation** | Gerar documentação com IA | ✅ Gate | `capability=documentation_generation` |
| | Regenerar / Melhorar / Validar / Comparar | ⏳ Pending | reuse same mutation; gate UI not yet attached |
| **Modernize** | Análise profunda | ✅ Gate | `capability=modernize_deep_analysis` |
| | Analisar / diagnóstico / plano / auto-refactor / explicar / revalidar | ⏳ Pending | server uses resolver; gate UI pending |
| **Laboratory** | AI Assistant | ✅ Inline | provider badge + confirmation note (replaced stale "no provider" text) |
| | Security / Endpoint / Architecture / Explain / Patch | ⏳ Pending | provider visible on AI Assistant; per-action gates pending |
| **Meta-Fábrica** | Agentes (pipeline: Architect…DevOps) | ✅ Inline | `LlmProviderInline` on agent pipeline header |
| | Regenerar etapa / corrigir falha / auto-repair | ⏳ Pending | provider shown; per-step gate pending |
| **Auto Repair** | Aplicar correção com IA | ✅ Gate | `capability=auto_repair_apply` |
| | Plano / explicar patch / revalidar | ⏳ Pending | gate UI pending |

## Honest summary
- **Done now:** the single standardized gate + the reusable adoption pattern (`LlmGatedAction`), wired into the highest-value/acceptance-critical action of each module: Project Room (PromptMaster + deep analysis), Architect (generate + regenerate blueprint), Documentation (generate), Modernize (deep analysis), Auto Repair (apply), plus provider visibility in Meta-Factory and Laboratory.
- **Deep analysis is gated once** in the shared `DeepAnalysisPanel`, so every consumer (Room, Modernize, future Engineering surfaces) inherits the gate — no duplicated logic.
- **Pending (tracked):** secondary actions within Documentation/Modernize/Laboratory/Meta-Factory listed above. They already route through the backend resolver (so they are never *silently* deterministic — see `llm_no_silent_fallback_validation.md`), but they do not yet render the confirmation gate. These are mechanical follow-ups using the same `LlmGatedAction` wrapper.

This report does not claim full per-action gate coverage of all ~40 listed actions; it states precisely what is gated, what shows provider inline, and what remains.
