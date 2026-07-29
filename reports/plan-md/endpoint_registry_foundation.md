# Endpoint Registry Foundation

Date: 2026-05-20

## Scope

- Added official endpoint contracts in `packages/contracts/endpoint.contract.ts`.
- Added backend endpoint registry seed in `apps/api/app/registry/endpoints_registry.py`.
- Added backend endpoints:
  - `GET /api/registry/endpoints`
  - `GET /api/registry/business-modules/{module_id}/endpoints`
- Added frontend endpoint selection in Wizard.

## Seed Coverage

- Auth:
  - `auth.login`
  - `auth.register`
  - `auth.refresh`
  - `auth.logout`
  - `auth.me`
- Users:
  - `users.list`
  - `users.create`
  - `users.detail`
  - `users.update`
  - `users.delete`
- Products:
  - `products.list`
  - `products.create`
  - `products.detail`
  - `products.update`
  - `products.delete`
- Orders:
  - `orders.list`
  - `orders.create`
  - `orders.detail`
  - `orders.update_status`
- Payments:
  - `payments.create`
  - `payments.webhook`
  - `payments.list`
- AI planning:
  - `ai.chat`
  - `ai.generate`
  - `ai.embeddings`
- Analytics/admin:
  - `analytics.overview`
  - `analytics.revenue`
  - `analytics.activity`
  - `admin.audit_logs`
  - `admin.settings`

## Validation

- `GET /api/registry/endpoints`: passed
- `GET /api/registry/business-modules/users/endpoints`: passed
- Wizard endpoint selection validated against backend rules: passed

## Outcome

Endpoints are now explicit blueprint choices with method, path, security level, business module affinity, stack support, and minimum architecture metadata.
