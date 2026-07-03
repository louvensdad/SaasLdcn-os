# Meta-Factory Agent Pipeline — Resilience

**Branch:** `feat/premium-foundation` · **Date:** 2026-06-28
**Validation:** backend `pytest` **442 passed, 1 skipped**.

## The real failing layer
The log errors *"Contrato (API First) falhou"* and *"No FULL Blueprint found in agent output"* are **not** the Architect blueprint engine — they come from the Meta-Factory **agent-output parser** (`app/services/file_protocol.py`). Each agent (contracts/backend/frontend/qa/devops/docs) must emit files using strict markers:

```
<<<FILE path="relative/path.ext">>>
…content…
<<<END>>>
```

If a model instead returned its files inside plain markdown code fences (very common on weaker models), the parser found **zero** `<<<FILE>>>` blocks, recorded *"No FILE blocks found in agent output"*, the contracts stage failed, and the **whole generation stopped** — even though the response contained perfectly good files.

## What changed

### 1. Tolerant parser (`file_protocol.py`)
When no `<<<FILE>>>` markers are present, files are now recovered **by meaning** instead of giving up:
- **Markdown fences** — path taken from the fence info string (```` ```python app/main.py ````), an inline `# file: …` / `// path: …` comment, or a preceding label/heading (`**src/Main.java**`).
- **JSON files array** — `{"files":[{"path","content"}]}` (lenient: tolerates trailing commas), with `file`/`name` and `body`/`code`/`source` aliases.
- **XML** — `<file path="…">…</file>` (incl. CDATA / inner fence stripping).

Strict markers still win at confidence `1.0`. Recovery is a **warning, not an error** — the stage passes and the flow continues. Only a genuinely empty/unparseable reply is an error.

### 2. Smart retry (`factory_pipeline._run_agent`)
Up to **3 attempts**. When an attempt yields no files, the next one appends a format-correction instruction (re-stating the `<<<FILE>>>` protocol). Every attempt is logged: `attempt, model, latency_ms, tokens, parser_strategy, parser_confidence, file_count, ok, stopped_by, reason`.

### 3. Diagnostics + never-lose-response
`ParsedAgentOutput` now carries `raw_response`, `parser_strategy`, `parser_confidence`, `missing`, and the `attempts[]` log, plus a `.diagnostics()` payload. The SSE `agent_finished` event now includes `parser_strategy`, `parser_confidence`, `attempts`, and `diagnostics` so the UI can show provider, model, time, tokens, parser status, confidence %, and attempt count.

## Acceptance criterion
> Even if the model responds in free Markdown, partial JSON, or structured text, the pipeline reconstructs valid output and lets the flow continue.

Met and tested: a backend agent returning markdown-with-label produces files, the gate **passes**, no error — the run proceeds to the next agent and on to Engineering Review / Meta-Factory without a forced re-generation.

## Tests (`tests/test_agent_output_resilience.py`, 10)
markers (1.0 confidence) · markdown info-string path · markdown label-before-fence · inline `# file:` comment · JSON files array · XML `<file>` · truly-empty is the *only* error (raw preserved) · diagnostics payload shape · pipeline recovers markdown without markers (gate passes) · smart retry logs 3 attempts with a clear reason. Plus the existing `test_single_agent_retries_once_on_empty_reply` updated to assert the new attempt log.

## Honest scope / follow-ups
- **Phase 5 — manual recovery buttons** (Reparar / Executar parser tolerante / Converter Markdown·JSON·YAML / Trocar provider / Baixar resposta bruta) are a **frontend** layer. The backend now exposes everything they need via the `agent_finished` diagnostics + raw response; wiring the buttons into the Meta-Factory UI is the remaining step.
- **Version history of reconstructions** — attempts are logged per run; a persisted multi-version store (original → normalized → reconstructed across runs) is a follow-up (today the per-attempt log lives on the run/event).
- The Architect *blueprint* response pipeline (separate layer) was made resilient in the prior change — see `reports/llm_response_pipeline.md`.

## Files
**New:** `apps/api/tests/test_agent_output_resilience.py`.
**Modified:** `app/services/file_protocol.py`, `app/engines/factory_pipeline.py`, `apps/api/tests/test_meta_factory_stage.py`.
