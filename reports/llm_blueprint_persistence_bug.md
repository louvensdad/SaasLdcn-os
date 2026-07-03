# LLM Blueprint Persistence Bug

## Root cause

The Architect stored provider display names in `provider`, used legacy uppercase modes, omitted canonical LLM metadata, and swallowed provider/schema errors into a deterministic Blueprint. The Review could therefore receive a newly generated deterministic artifact even though the user explicitly selected an LLM.

## Correction

- LLM Blueprints now persist canonical `provider`, `providerLabel`, `model`, `mode=llm`, `source=llm`, version, token, latency and `llmMetadata` fields.
- Deterministic Blueprints persist `provider=null`, `mode=deterministic`, `source=deterministic` and `degraded=true`.
- A resolved LLM failure raises an explicit error; no deterministic version is saved.
- The prior Blueprint/status is restored when generation fails.

## Compatibility

Legacy Blueprint metadata is normalized on read without guessing from frontend state.
