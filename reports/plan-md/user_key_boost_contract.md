# User Key Boost Contract

Contract file: `packages/contracts/user-key-boost.contract.ts`

## Status

Planned and inactive in V1 Foundation.

## Key points

- Supports OpenAI, Gemini, and Anthropic as future providers.
- Supports `session_only` and future `encrypted_session` storage modes.
- Uses `no_key`, `temporary_key_active`, `platform_key_active`, and `deleted`.
- Returns `key_material_returned: false`.
- Redacts `api_key`.
- Supports `delete_after_generation`.

## Placeholder endpoints

- `GET /api/user-ai-keys/status`
- `POST /api/user-ai-keys/session`
- `DELETE /api/user-ai-keys/session`
