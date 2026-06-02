# User Key Boost

## V1 Foundation stance

User Key Boost is planned but inactive. V1 Foundation exposes only placeholder endpoints that return `501 Not Implemented` with:

`Feature planned but not active in V1 Foundation.`

No provider API is called, no key is validated, and no user key is persisted.

## Contract

The canonical contract is `packages/contracts/user-key-boost.contract.ts`.

Supported future generation modes:

- `local_build_90`
- `platform_boost_100`
- `user_key_boost`

Supported future statuses:

- `no_key`
- `temporary_key_active`
- `platform_key_active`
- `deleted`

## Security rules

- The API key must never be returned to the frontend.
- The API key must never be logged.
- The API key must never enter Prompt Master trace, Gatekeeper trace, generated files, ZIPs, or Git export.
- Temporary key material must support expiration.
- Users must be able to delete active key material.
- `delete_after_generation` must be honored when generation support is later added.

## Placeholder endpoints

- `GET /api/user-ai-keys/status`
- `POST /api/user-ai-keys/session`
- `DELETE /api/user-ai-keys/session`

All currently return `501`.
