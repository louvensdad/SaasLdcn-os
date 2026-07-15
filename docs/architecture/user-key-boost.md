# User Key Boost

## Status

User Key Boost is implemented and authenticated. It stores user-owned provider keys as encrypted, expiring sessions and never returns raw key material. Production uses the Redis-backed vault; the in-memory encrypted backend is for local development only.

## Endpoints

- `GET /api/user-ai-keys/status`: masked active sessions and remaining TTL.
- `POST /api/user-ai-keys/test`: validates a key without storing it.
- `POST /api/user-ai-keys/session`: creates or replaces an encrypted provider session.
- `DELETE /api/user-ai-keys/session`: deletes one provider session or all sessions.

Supported providers are Anthropic, OpenAI, Google, OpenRouter, DeepSeek, and custom providers. Generation may use the active user session; deterministic and platform-key modes remain available according to runtime configuration.

## Security contract

- Raw keys are never returned, logged, added to traces, prompts, generated files, ZIPs, Git exports, SSE events, or error responses.
- Provider errors are redacted before being returned.
- Ciphertext has a server-enforced TTL and is isolated by user and provider.
- Production requires Redis and a distinct `LDCN_TOKEN_ENC_KEY` of at least 32 characters.
- Deleting a session removes its stored ciphertext.

The API schemas are authoritative for request and response fields; shared UI contracts live under `packages/contracts`.