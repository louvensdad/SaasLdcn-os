# Wizard Infrastructure Runtime Validation

Validated the wizard integration with live backend infrastructure recommendations.

## Browser Scenarios

- Spring Boot + microservices
  - wizard advances through technology path, architecture, project type, capabilities, and business modules
  - infrastructure panel becomes visible
  - required and recommended infrastructure are shown by category
  - warnings are shown when the foundation mix is incomplete or split across brokers
- FastAPI + AI
  - wizard shows the vector database category
  - vector database recommendations render in the panel
- Backend offline routing
  - the wizard renders the safe offline fallback instead of crashing

## Playwright Result

- `tests/infrastructure-registry.spec.ts`
- `3 passed`

## Notes

- The wizard was adjusted to permit capability-free progression when the registry returns no compatible capabilities for a given combination.
- The browser dev origin on port `3001` was added to the API CORS allowlist so the local Next dev server can reach the backend.
