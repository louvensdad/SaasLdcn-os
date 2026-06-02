# Complexity Engine Foundation

Date: 2026-05-20

## Implemented factors

- architecture complexity
- framework maturity
- number of capabilities
- number of business modules
- number of endpoints
- infrastructure requirements
- security impact

## Output profile

- `overall_score`
- `learning_curve`
- `implementation_effort`
- `infrastructure_cost`
- `maintenance_cost`
- `team_size_recommendation`
- `risk_level`

## Classification model

- `low`
- `medium`
- `high`
- `enterprise`
- `hyperscale`

## Foundation behavior

- Simpler selections such as monolith or modular monolith with a small capability and endpoint set remain in the lower ranges
- Infrastructure-heavy selections such as microservices accumulate additional score through infrastructure and coordination costs
- Security-sensitive selections such as payments and advanced auth increase the total score
- Endpoint and capability growth increases effort even when the core stack stays the same

## Recommendation coupling

- Auth without RBAC recommends `rbac`
- `ai_chat` recommends `rate_limiting` and `observability`
- `payments` recommends `audit_logs`
- `microservices` recommends `docker`, `observability`, and `queue`
- `landing_page` recommends `seo` and `analytics`
- Non-default locale usage recommends `i18n`

## Validation evidence

- Backend tests confirm complexity increases with added capabilities and endpoints
- Runtime preview exposes the computed complexity profile directly in the Wizard review UI
