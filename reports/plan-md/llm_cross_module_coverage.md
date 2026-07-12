# LLM Cross-Module Coverage

**Branch:** `feat/premium-foundation` · **Date:** 2026-06-28

How each module adopts the single global LLM gate. One hook (`useActiveLlm`), one component (`LlmConfirmationGate`), one wrapper (`LlmGatedAction`), one inline badge (`LlmProviderInline`).

## Files changed (frontend)
**New**
- `components/llm/llm-gated-action.tsx` — `LlmGatedAction`, `DeterministicBadge`, `LlmProviderInline`.

**Modified**
- `components/llm/llm-confirmation-gate.tsx` — premium rewrite (3 states, all sub-badges).
- `hooks/use-active-llm.ts` — `isFailed`/`isNotConfigured`/`isFetching`/`revalidate`/provider deep-link + `LLM_PROVIDER_OPTIONS`.
- `components/engineering/deep-analysis-panel.tsx` — optional `capability`/`usageLabel` gating (shared by Room/Modernize/Engineering).
- `app/(app)/documentation/page.tsx` — generate gated.
- `app/(app)/modernize/page.tsx` — deep analysis gated.
- `app/(app)/architect/page.tsx` — generate + regenerate blueprint gated; removed hardcoded provider buttons.
- `app/(app)/project-rooms/[roomId]/page.tsx` — PromptMaster gate (pre-existing) + deep analysis gated.
- `app/(app)/meta-factory/page.tsx` — agent pipeline provider inline.
- `app/(app)/engineering-laboratory/page.tsx` — AI Assistant now provider-aware (replaced stale "no provider" copy).
- `app/(app)/auto-fix/page.tsx` — apply correction gated.

## Module adoption

### Project Room
- Generate PromptMaster → gate (`prompt_master_generation`).
- Deep analysis → gate (`architecture_deep_analysis`) via shared panel.
- Revise/approve advance through the resolver; the room replaces local state from each response.

### Architect
- Generate Blueprint and Regenerate Blueprint with AI → gate (`architecture_blueprint`).
- The previous hardcoded "Conectar GPT/Claude/Gemini/DeepSeek" buttons were removed; the gate's `not_configured` state now offers provider configuration from the canonical list.

### Engineering Review
- Consumes the review assessment generated in the gated Architect/room pipeline; the page performs approval + handoff (`startEngineeringReview → acknowledge → approve → send-to-generator`). No separate AI generation step here to gate.

### Documentation
- Generate documentation → gate (`documentation_generation`). Regenerate/Improve/Validate/Compare are tracked follow-ups (same wrapper).

### Modernize
- Deep analysis → gate (`modernize_deep_analysis`). Analyze/diagnose/plan/auto-refactor/explain/revalidate route through the resolver; gates are tracked follow-ups.

### Laboratory
- AI Assistant now shows `LlmProviderInline` and a confirmation note instead of the old "no provider selected" message.

### Meta-Fábrica
- Agent pipeline header shows `LlmProviderInline` (provider per agent run is the single global provider, surfaced once for the pipeline).

### Auto Repair
- Apply correction with AI → gate (`auto_repair_apply`).

## Anti-pattern audit
- ✅ No parallel provider state — every surface reads `useActiveLlm()`.
- ✅ No hardcoded provider at call sites (removed in Architect).
- ✅ No direct `localStorage` in gate paths.
- ✅ Deep-analysis gating centralized in one shared component (no duplication).

## Status
Acceptance-critical action of each module is covered (gate or inline). Secondary actions are enumerated as tracked follow-ups in `llm_visual_gate_coverage.md`; they remain safe (resolver-enforced) but not yet gated in the UI.
