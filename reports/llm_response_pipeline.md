# LLM Response Pipeline — Resilient Blueprint Parsing

**Branch:** `feat/premium-foundation` · **Date:** 2026-06-28
**Validation:** backend `pytest` **432 passed, 1 skipped** · web `tsc` clean · `next build` clean (26/26).

## The bug
The Architect rejected valid responses with *"O provider respondeu sem um Blueprint arquitetural válido"* even when the model produced correct decisions. Two rigid points:
1. **Adapters raised** `LLMError` whenever a `json_schema` request didn't return *pure* JSON — so fenced JSON (```json … ```) or any prose around the JSON failed outright.
2. **The engine required** a top-level `decisions` key and strict `BlueprintDecision` validation — any other shape (area-map, list, wrapper key, markdown) was discarded.

## The fix — a resilient pipeline
New module `app/engines/llm/blueprint_response_pipeline.py`. The Architect now passes the spec **without a hard `json_schema`** (the system prompt still asks for JSON) and runs the raw text through:

```
raw text/parsed → Extractor → Normalizer → Auto-Repair → Validator → Recovery → Diagnostics
```

No provider needs to know the LDCN internal format; the LDCN OS adapts the response.

## Phase-by-phase status

| Phase | What | Status |
|-------|------|--------|
| 1 — Raw save | `RawResponseRecord`: provider, model, prompt size, **redacted** raw response, sha-256 hash, tokens, latency, temperature. Never discarded. | ✅ Captured + attached to `blueprint.responseDiagnostics.raw_record`. *(Follow-up: a dedicated raw-response table; today it rides on the blueprint.)* |
| 2 — Extractor | JSON, fenced ```json/```yaml, sliced JSON (prose around it), **partial/truncated JSON** (trailing-comma + brace-balancing, even mid-value), YAML. | ✅ |
| 3 — Normalizer | `decisions` key, wrapper keys (`blueprint`/`architecture`/`areas`/`design`/…), **nested** wrappers, top-level list, **area-map** (`{frontend: "Next.js"}` or `{frontend: {...}}`), markdown sections (inline `Area: choice` **and** `## Area`+body), single decision. | ✅ |
| 4 — Auto-Repair | Field aliases (`decision/recommendation`→`choice`, `rationale/reason`→`justification`, `alternatives`→`alternatives_considered`, …), area synonyms (`front-end`/`db`/`devops`→canonical), missing **optional** fields → `[]`/`""`, confidence coercion, unknown keys dropped. Never fails on a missing optional. | ✅ |
| 5 — Schema Validator | Only `area`, `choice`, `justification` required (schema already; pipeline guarantees them). Never demands perfect equality. | ✅ |
| 6 — Recovery | Per-decision `try/except` — one broken decision is dropped, the rest recovered. `partial` flag + `areas_missing` + `dropped`. A valid response is never lost. | ✅ |
| 7 — Diagnostics | `extractor_used`, `normalizer_used`, `parser_used`, `decisions_found`, `areas_present`/`areas_missing`, `repaired_fields`, `reason`, redacted `raw_excerpt`, provider, model. Never a bare "Blueprint inválido". | ✅ |
| 8 — Viewer | "Resposta da IA" tab on `/architect` (`BlueprintResponseViewer`): raw response, partial/complete + recovered badges, extractor/normalizer/parser used, áreas presentes/ausentes, campos auto-reparados, reason. | ✅ *(shows raw + normalized summary; a literal side-by-side raw-vs-final diff is a follow-up.)* |
| 9 — Providers | The pipeline is **provider-agnostic** (operates on text). The router already routes OpenAI, Claude, Gemini, DeepSeek, OpenRouter, Ollama, and a custom OpenAI-compatible adapter (covers **LM Studio**) — all through this same pipeline. | ⚠️ Partial: **Azure OpenAI** needs its own adapter (distinct endpoint/auth) — follow-up. |
| 10 — Tests | Real-model shapes: clean JSON, fenced+prose, top-level list, area-map, markdown sections, markdown headings, partial JSON, truncated mid-value, YAML, field aliases, synonyms, partial recovery, unparseable (raw preserved), secret redaction, every common shape. | ✅ 20 pipeline + 2 engine tests. |

## Behavior change (intentional)
`build_blueprint` no longer raises on a format difference. With a configured key it now:
- **recovers** a full or **partial** blueprint (partial flagged with reason + missing areas), or
- if truly nothing is parseable, returns the **deterministic** preview **with `responseDiagnostics` attached** (never silent, never a bare error).

The one legitimate hard failure is preserved: a key was supplied but the router served a **mock/deterministic fallback** (the real provider never ran) → explicit `LLMError`, not a silent save. (`test_resolved_llm_never_silently_saves_deterministic_fallback`.)

## Security
The raw response and excerpt are passed through `redact_text` before storage/return (test `test_raw_record_redacts_secrets`). No prompt secrets or keys are persisted in diagnostics.

## Files
**New:** `app/engines/llm/blueprint_response_pipeline.py`, `apps/api/tests/test_blueprint_response_pipeline.py`, `apps/web/components/project/blueprint-response-viewer.tsx`.
**Modified:** `app/engines/architect_engine.py`, `app/schemas/architecture_blueprint.py` (+`responseDiagnostics`), `packages/contracts/architecture-blueprint.contract.ts`, `app/(app)/architect/page.tsx`, `apps/api/tests/test_architect_engine.py`.

## Honest follow-ups
1. Dedicated persistent raw-response store (today the redacted raw record is attached to the blueprint).
2. Azure OpenAI adapter (LM Studio already covered via the custom OpenAI-compatible adapter).
3. Literal side-by-side raw-vs-normalized diff in the viewer (today: raw + normalized summary).
