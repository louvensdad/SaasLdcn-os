# LLM Gate Component Standardization

**Branch:** `feat/premium-foundation` · **Date:** 2026-06-28

## One component, one pattern
All AI confirmation now flows through a single premium component and one adoption wrapper. No screen builds its own provider UI or reads `localStorage`/hardcoded providers.

### `components/llm/llm-confirmation-gate.tsx` — `LlmConfirmationGate`
The premium confirmation surface. Reads the global provider from `useActiveLlm()` (Settings = source of truth) and renders one of three states.

Required sub-elements (all present):
- **Provider badge** — `<Badge tone="accent">{providerLabel}</Badge>` (ready state).
- **Readiness badge** — Pronto / Requer atenção / Não configurado.
- **Model badge** — model row in the detail grid.
- **Action description** — `usageLabel` ("Ação").
- **Last validated** — `lastValidatedAt`, formatted.
- **Security note** — "A chave permanece no servidor — nunca é exposta ao frontend, logs, reports ou projetos gerados." (always shown).
- **Confirmation buttons** — state-specific (below).
- **Deterministic fallback warning** — always-visible amber note that deterministic = degraded/no-AI.

State → buttons:
| State | Headline | Buttons |
|-------|----------|---------|
| `ready` | "{Provider} configurado" | Continuar com {Provider} · Trocar LLM · Usar modo determinístico |
| `not_configured` | "Nenhum LLM configurado" | Configurar Claude/GPT/Gemini/DeepSeek/OpenRouter/Ollama · Usar modo determinístico |
| `failed` (invalid/expired/unavailable) | "Não foi possível usar {Provider}" | Testar novamente · Atualizar chave · Escolher outro LLM · Usar modo determinístico |

Testability: the root renders `data-llm-gate="ready|failed|not-configured"` and `data-llm-capability="<capability>"` for E2E selectors.

### `components/llm/llm-gated-action.tsx`
- **`LlmGatedAction`** — render-prop wrapper that owns the open/close state and renders the gate on demand. The single adoption pattern:
  ```tsx
  <LlmGatedAction capability="documentation_generation" usageLabel="Gerar documentação" onRun={run}>
    {(open) => <Button onClick={open}>Gerar documentação</Button>}
  </LlmGatedAction>
  ```
- **`DeterministicBadge`** — standard "Preview determinístico" marker for degraded output.
- **`LlmProviderInline`** — compact read-only active-provider badge for headers (Meta-Factory agents, Laboratory).

### `hooks/use-active-llm.ts` (extended)
Single source of truth. Added: `isFailed`, `isNotConfigured`, `isFetching`, `revalidate()` (for "Testar novamente"), `openProviderSettings(provider?)` (deep-link with provider), and `LLM_PROVIDER_OPTIONS` (canonical provider list for the not-configured buttons — no hardcoding at call sites).

## Global-state rules enforced
- ✅ All gate/provider UI derives from `useActiveLlm()` — no parallel state.
- ✅ No hardcoded provider lists at call sites (the Architect's old hardcoded "Conectar GPT/Claude/…" branch was removed in favor of the gate).
- ✅ No direct `localStorage` access in any gate path.
- ✅ Provider logic lives in one hook + one component; screens only declare `capability` + `usageLabel`.

## Verification
`tsc --noEmit` clean · `next build` clean. Component is consumed by Project Room, Architect, Documentation, Modernize, Auto Repair, Meta-Factory, Laboratory, and the shared `DeepAnalysisPanel`.
