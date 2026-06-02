# Framework Readiness Profiles

Date: 2026-05-20

## Readiness Model

- `baseline`: usable only for narrow, low-risk delivery.
- `practical`: ready for product delivery with normal team discipline.
- `enterprise`: ready for governed, long-lived production systems.
- `advanced`: reserved for deeper scale or architectural maturity.

## Initial Readiness Snapshots

| Framework | Readiness |
| --- | --- |
| Spring Boot | Enterprise |
| NestJS | Enterprise |
| Next.js | Practical |
| Express | Practical |
| React | Practical |
| Angular | Practical |
| FastAPI | Enterprise |
| Django | Practical |
| ASP.NET Core | Enterprise |
| Laravel | Practical |
| Gin | Practical |
| Fiber | Practical |

## Common Signals

- Auth, observability and validation are part of the baseline.
- Strong module boundaries are required for larger backends.
- Frontend frameworks require routing and state discipline.
- Async services require explicit handling of blocking work.
