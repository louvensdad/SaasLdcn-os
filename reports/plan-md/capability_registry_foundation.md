# Capability Registry Foundation

Date: 2026-05-20

## Scope

- Added official capability contracts in `packages/contracts/capability.contract.ts`.
- Added backend capability registry seed in `apps/api/app/registry/capabilities_registry.py`.
- Added backend endpoints:
  - `GET /api/registry/capabilities`
  - `GET /api/registry/stacks/{stack_id}/capabilities`
- Added frontend capability consumption via:
  - `apps/web/hooks/use-capabilities.ts`
  - Wizard capability selection
  - Command Palette capability listing

## Seed Coverage

- Security/platform:
  - `authentication`
  - `rbac`
  - `multi_tenancy`
  - `queue`
  - `cache`
  - `docker`
  - `observability`
  - `ci_cd`
  - `api_docs`
  - `rate_limiting`
- Product/business enablement:
  - `payments`
  - `subscriptions`
  - `email_notifications`
  - `websocket`
  - `realtime`
  - `file_upload`
  - `search`
  - `analytics`
  - `audit_logs`
  - `seo`
  - `i18n`
  - `pwa`
- AI-planning only:
  - `ai_chat`
  - `rag`

## Validation

- `GET /api/registry/capabilities`: passed
- `GET /api/registry/stacks/static_site/capabilities`: passed
- Command Palette showing capability items: passed
- Wizard capability checklist using live backend registry: passed

## Outcome

Capabilities are now first-class, stack-aware registry items with dependency and minimum architecture-level metadata, ready for stricter compatibility rules later.
