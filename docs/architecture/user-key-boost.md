# User Key Boost

## Status

User Key Boost is implemented and authenticated. It stores named, user-owned provider keys encrypted at rest and never returns raw key material. Keys persist until the owner explicitly removes them.

## Endpoints

- `GET /api/user-ai-keys`: lists owner-scoped masked keys and validation status.
- `POST /api/user-ai-keys`: stores a named encrypted key with status `untested`.
- `POST /api/user-ai-keys/test`: validates a candidate without storing it.
- `POST /api/user-ai-keys/{key_id}/test`: decrypts and validates a saved key, then persists the canonical provider state.
- `POST /api/user-ai-keys/{key_id}/default`: selects the default key for its provider.
- `DELETE /api/user-ai-keys/{key_id}`: permanently removes one owner-scoped key.

Supported providers, in canonical order, are OpenAI, Anthropic (Claude), Google Gemini, DeepSeek, and Groq.

## Security contract

- Raw keys are never returned, logged, added to traces, prompts, generated files, ZIPs, Git exports, SSE events, or error responses.
- Provider errors use a redacted common contract.
- Ciphertext is isolated by user and provider and encrypted with `LDCN_TOKEN_ENC_KEY`.
- A saved key is not considered ready until a real minimal provider request succeeds.
- Removing a key deletes its stored ciphertext; rotation is remove and recreate.

The API schemas are authoritative for request and response fields; shared UI contracts live under `packages/contracts`.
