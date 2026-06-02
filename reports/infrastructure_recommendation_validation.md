# Infrastructure Recommendation Validation

Validated the infrastructure recommendation engine against the live registry and wizard flows.

## Backend scenarios

- Spring Boot + microservices
  - returns PostgreSQL
  - returns Redis
  - returns a message broker recommendation such as RabbitMQ or Kafka
  - returns Docker Compose and observability guidance
- Next.js
  - returns Vercel
  - returns PostgreSQL
  - returns `nextauth` and/or `clerk`
- FastAPI + AI/RAG
  - returns PostgreSQL
  - returns Redis
  - returns vector database guidance such as `pgvector`, `qdrant`, or `pinecone`
  - returns observability guidance
- Unsupported component id
  - returns `404`

## Validation Commands

- `pytest apps/api/tests/test_infrastructure_registry.py apps/api/tests/test_blueprints.py apps/api/tests/test_framework_specialists.py`
- `npm run typecheck`
- `npm run build`
- `npx playwright test tests/infrastructure-registry.spec.ts --reporter=line`

## Result

- Backend tests passed
- Frontend typecheck passed
- Frontend build passed
- Browser validation passed
