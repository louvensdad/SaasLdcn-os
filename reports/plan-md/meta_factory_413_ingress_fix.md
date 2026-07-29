# Meta-Factory HTTP 413 — Ingress (request body) fix

**Branch:** `feat/premium-foundation` · **Date:** 2026-06-28
**Validation:** backend `pytest` **453 passed, 1 skipped** · web `tsc` clean.

## The new 413 is different from the last one
The previous 413 work fixed the **agent → LLM** call (Context Packs + partitioned retry). This log line is a *different* layer:

```
POST /api/meta-factory/generate/stage/stream  413 Request Entity Too Large
```

This is the **inbound request body** to the LDCN API being rejected — before any agent runs.

## Forensic finding — it is NOT our app or uvicorn
Measured directly:
- **ASGI app (TestClient, bypasses the server):** accepts a **12 MB** body → `200`.
- **Real uvicorn server (httptools + h11):** accepts a **16 MB** body → `200`.
- uvicorn maps both h11 and httptools parser errors to **400**, never 413; Starlette/FastAPI/app code never return 413 for this route.

So the 413 is produced by a **reverse proxy in front of the API** (the phrase "Request Entity Too Large" is the classic **nginx `client_max_body_size`** default of **1 MB**). The browser → proxy → uvicorn path is the only place a 413 can originate here.

## Why the body got big
`generate/stage/stream` re-sent the **full `spec` + full `blueprint`** in the body of **every** stage (contracts, backend, frontend, qa, devops, docs). For an Enterprise project (hundreds of entities/rules/workflows, a 10-decision blueprint with deep rationale) each request can exceed a 1 MB proxy limit — and the blueprint also carried the resilient-pipeline `responseDiagnostics` (raw AI excerpt) that generation never needs.

## Fix — reference by `project_id`, slim body (the recurring principle)
1. **Persist once:** on the first stage (Contracts), the server writes the redacted `spec` + `blueprint` to `.ldcn-inputs.json` beside the generated project.
2. **Reference afterwards:** `_stage_context` loads the persisted inputs by `project_id`, so stages 2..N don't need them in the body.
3. **Slim client body:** `generateStageStream` now sends the full spec/blueprint **only on the first stage**; once a `project_id` exists it sends a minimal spec (`{ raw_intent }`) and `blueprint: null`. It also strips `responseDiagnostics` from the blueprint on the first stage (transport-only bulk).

Result: stage 1 sends the spec once (small, no diagnostics); stages 2–6 send a near-empty body. The per-request payload stays far under any sane proxy limit.

## Tests
`tests/test_meta_factory_413.py::test_stage_inputs_persisted_and_referenced_by_project_id`: persists inputs on stage 1, then a **slim** stage-2 request (no real spec/blueprint, only `project_id`) still builds the full agent context from the persisted inputs (entity `Paciente` + blueprint decision `Spring Boot` both reach the context). Plus the existing 413 Context-Pack suite (10 tests).

## Honest caveat / required infra step
The application now keeps request bodies small, which resolves the 413 for the realistic case. **But if a proxy with a 1 MB limit sits in front of the API, also raise it** as defense-in-depth:

```nginx
location /api/ { client_max_body_size 25m; }
```

I could not inspect the user's proxy (it isn't in this repo); the app-side fix is what's in our control and is verified. The first-stage spec is still sent once — for a pathologically huge spec that single request could still approach a 1 MB proxy default, which the nginx setting above covers.

## Files
**Modified:** `app/routes/meta_factory.py` (persist/load `.ldcn-inputs.json`, reference by project_id), `apps/web/lib/api/meta-factory.ts` (slim body + strip diagnostics), `apps/api/tests/test_meta_factory_413.py`.
