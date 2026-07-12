# Language Domain Endpoints

Implemented a language-scoped API surface under `GET /api/languages/{language_id}/...`.

## Endpoints

- `GET /api/languages/java/profile`
- `GET /api/languages/java/frameworks`
- `GET /api/languages/java/architectures`
- `GET /api/languages/java/archetypes`
- `GET /api/languages/java/capabilities`
- `GET /api/languages/java/recommendations`
- `GET /api/languages/typescript/profile`
- `GET /api/languages/typescript/frameworks`
- `GET /api/languages/typescript/architectures`
- `GET /api/languages/typescript/archetypes`
- `GET /api/languages/typescript/capabilities`
- `GET /api/languages/typescript/recommendations`
- `GET /api/languages/python/profile`
- `GET /api/languages/python/frameworks`
- `GET /api/languages/python/architectures`
- `GET /api/languages/python/archetypes`
- `GET /api/languages/python/capabilities`
- `GET /api/languages/python/recommendations`
- `GET /api/languages/csharp/profile`
- `GET /api/languages/csharp/frameworks`
- `GET /api/languages/csharp/architectures`
- `GET /api/languages/csharp/archetypes`
- `GET /api/languages/csharp/capabilities`
- `GET /api/languages/csharp/recommendations`
- `GET /api/languages/php/profile`
- `GET /api/languages/php/frameworks`
- `GET /api/languages/php/architectures`
- `GET /api/languages/php/archetypes`
- `GET /api/languages/php/capabilities`
- `GET /api/languages/php/recommendations`
- `GET /api/languages/go/profile`
- `GET /api/languages/go/frameworks`
- `GET /api/languages/go/architectures`
- `GET /api/languages/go/archetypes`
- `GET /api/languages/go/capabilities`
- `GET /api/languages/go/recommendations`

## Notes

- The router is implemented in `apps/api/app/routes/language_domains.py`.
- The domain logic is centralized in `apps/api/app/services/language_domain_service.py`.
- Unsupported language IDs return a clear `404` with `Language '{id}' was not found.`
- Recommendations are language-specific and remain read-only. No AI, generation, or agents were added.

## Validation

- `python -m pytest apps/api/tests/test_language_domains.py`
- `python -m pytest apps/api/tests`

