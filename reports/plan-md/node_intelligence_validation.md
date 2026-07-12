# Node Intelligence Validation

Status: passed on 2026-05-28.

Every architectural node returns the required intelligence fields:

- `status`
- `burden_score`
- `risk_level`
- `readiness_score`
- `ownership_role`
- `required_skills`
- `warnings`
- `recommendations`
- nested `health`, `risk`, `readiness`, and `ownership` objects

Validated node rules:

- Kafka is `event_bus`, has high burden, carries event bus risk, and warns that observability is required.
- Kubernetes is `deployment`, has enterprise burden, uses `devops/sre` ownership, and warns about SRE ownership/high complexity.
- Payment provider is `external_provider`, medium burden or higher, and receives contract-review risk.
- Databases receive data ownership and high readiness.
- Microservice gateway/service nodes inherit higher burden under `microservices`.
- Unknown architecture fallback still emits node warnings instead of failing.

Frontend intelligence rendering:

- Node cards show burden and readiness badges.
- Degraded/watch states receive distinct visual treatment.
- Details panel exposes readiness, ownership, risk, burden, required skills, warnings, and recommendations after node click.
- Mobile summary preserves label, type, ownership, and burden for simplified mode.

Evidence:

- `apps/api/tests/test_architectural_graph.py`: all graph intelligence assertions passed.
- `apps/web/tests/architectural-graph.spec.ts`: node details and mobile summary assertions passed.
