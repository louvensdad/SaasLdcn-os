# User Key Boost Architecture

## Scope

Phase A defines the contract and security posture for a future `user_key_boost` mode. It does not call OpenAI, Gemini, Anthropic, or any external model provider.

## Generation modes

- `local_build_90`: local/template governed generation path.
- `platform_boost_100`: future platform-owned model key path.
- `user_key_boost`: future temporary user-owned model key path.

The canonical TypeScript contract is `packages/contracts/ai-key.contract.ts`. The shared blueprint mode union is extended in `packages/contracts/blueprint.contract.ts`.

## Foundation endpoints

- `POST /api/user-ai-keys/session`: accept provider, API key, storage mode, and `delete_after_generation`.
- `DELETE /api/user-ai-keys/session`: delete active temporary key material.
- `GET /api/user-ai-keys/status`: return only status metadata.

Responses must never return the API key, masked key text, provider raw headers, or validation request material. The frontend can render only:

- `no_key`
- `temporary_key_active`
- `platform_key_active`
- `key_deleted`

## Storage policy

Allowed storage modes are `session_only` and `encrypted_session`. `session_only` is preferred for the first implementation. If `encrypted_session` is added later, encryption keys must come from platform secret management, not source code, generated project files, traces, or ZIP output.

## Frontend targets

- Settings -> AI Keys: provider selector, key input, delete action, status badge.
- Project Detail -> Choose Boost Mode: `local_build_90`, `platform_boost_100`, `user_key_boost`, and `Delete key after generation`.

The frontend must clear the key input after save and must not hydrate saved key material from the backend.

## Non-goals in Phase A

- No provider SDK integration.
- No API key validation call.
- No generation routing.
- No persistent user secret vault.
