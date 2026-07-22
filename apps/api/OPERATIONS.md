# LDCN OS API â€” Deployment & Operations Runbook

Production deployment and day-2 operations for the FastAPI backend (`apps/api`).
Addresses audit items **D1** (production README) and **D2** (operational runbook).

> The root `README.md` is the project overview. This document is the source of truth
> for **deploying and operating** the API in staging/production.

---

## 1. Prerequisites

- **Python 3.12+**
- **PostgreSQL 14+** (production database â€” do not run SQLite in production)
- **Redis 6+** (distributed rate limiting + user LLM key vault; required for any
  multi-instance / HA deployment)
- **S3-compatible object storage** (durable generated projects and prepared ZIPs)
- A reverse proxy terminating TLS (nginx, Caddy, ALB, â€¦) in front of Uvicorn

Install dependencies:

```bash
cd apps/api
pip install -r requirements.txt
```

---

## 2. Environment variables

Set these in the process environment (a local `apps/api/.env` is loaded for dev only;
real env vars always win). See `app/core/config.py` for defaults.

### Required in production (`LDCN_ENVIRONMENT=production`)
| Variable | Purpose | Notes |
|---|---|---|
| `LDCN_ENVIRONMENT` | `local` \| `staging` \| `production` | Gates docs, HSTS, rate limiting, cookie `Secure`. |
| `LDCN_SECRET_KEY` | JWT signing secret | **Startup fails in production if unset.** 32+ bytes, stable across instances. |
| `LDCN_DATABASE_URL` | SQLAlchemy URL | PostgreSQL is enforced at production startup; SQLite is local-only. |
| `LDCN_ALLOWED_ORIGINS` | CORS allowlist (comma-separated) | Production startup fails when empty. |
| `LDCN_REDIS_URL` | Redis connection | Production startup fails when empty; shared by rate limiter + key vault. |
| `LDCN_ARTIFACT_STORAGE` | Artifact backend | Must be `s3` in production (`local` is development-only). |
| `LDCN_ARTIFACT_BUCKET` | S3 bucket | Production startup fails when empty. |

### Recommended / optional
| Variable | Default | Purpose |
|---|---|---|
| `LDCN_TOKEN_ENC_KEY` | derived from secret | Separate key for encrypting secrets at rest (rotate independently). |
| `LDCN_TRUST_PROXY_HEADERS` | `0` | Set `1` behind a trusted proxy so rate limiting keys on the real client IP. |
| `LDCN_AGENT_WORKERS` | `8` | Global bound on concurrent blocking LLM-agent threads (audit B5). |
| `LDCN_MAX_CONCURRENT_GENERATIONS` | `3` | Max in-flight generations per user; extra â†’ HTTP 429 (audit MF3). |
| `LDCN_ARTIFACT_PREFIX` | `ldcn-artifacts` | Object-key prefix for project snapshots and downloads. |
| `LDCN_ARTIFACT_ENDPOINT` | AWS default | S3-compatible endpoint for MinIO, R2 or another provider. |
| `LDCN_ARTIFACT_REGION` | SDK default | Object-storage region. |
| `LDCN_FORCE_MOCK` | `0` | `1` forces the deterministic Mock generator (offline demo/tests). |
| Modernize limits | see config | `LDCN_MODERNIZE_MAX_ANALYZABLE_BYTES`, `_MAX_FILE_BYTES`, `_MAX_UPLOAD_BYTES`, `_ZIP_BOMB_RATIO`. |

---

## 3. Database & migrations (Alembic)

Schema is managed by Alembic (`apps/api/alembic/`). Do **not** rely on
`CREATE TABLE IF NOT EXISTS`; apply migrations on every deploy:

```bash
cd apps/api
export LDCN_DATABASE_URL="postgresql+psycopg2://user:pass@host:5432/ldcn"
alembic upgrade head        # apply latest schema
alembic current             # verify the applied revision
```

- New schema change: `alembic revision --autogenerate -m "describe change"`, review, commit.
- Zero-downtime: apply additive migrations before rolling out code that needs them.
- `20260701_c6_tenants` provisions a personal organization/workspace for existing users
  and backfills legacy Project Rooms and generation jobs before tenant enforcement.

---

## 4. Running the server

```bash
cd apps/api
export LDCN_ENVIRONMENT=production
# â€¦ set the required env vars from Â§2 â€¦
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

Run behind the TLS-terminating proxy. Production startup verifies the PostgreSQL, Redis,
explicit CORS and S3-compatible artifact-storage configuration before accepting traffic.

---

## 5. Security posture (verify before go-live)

- **Interactive docs are disabled outside `local`** (audit S4): no Swagger/ReDoc/
  `openapi.json` at runtime in staging/production. For partners, publish a static spec:
  ```bash
  python -m scripts.generate_openapi apps/api/openapi.json   # audit D3/L4
  ```
- **CORS**: `LDCN_ALLOWED_ORIGINS` must list the exact frontend origins.
- **Cookies**: refresh cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- **Rate limiting**: enabled automatically in production; tune `rate_limit_*` in config.
- **Secrets**: set `LDCN_SECRET_KEY` (+ optionally `LDCN_TOKEN_ENC_KEY`); never commit them.
  LLM provider errors are secret-redacted before logging (audit S3).

---

## 6. Operations runbook

### Health
- Liveness/readiness: `GET /api/health` (returns status JSON). Wire it to the load
  balancer and uptime monitor.

### Backups
- PostgreSQL: schedule `pg_dump` (or managed snapshots); test restore periodically.
- Enable bucket versioning/retention according to the recovery policy and test restoring
  generated-project snapshots and prepared downloads.

### A generation looks stuck / failed
- Generations are durable jobs (persisted; survive restart). Inspect:
  `GET /api/meta-factory/jobs/{id}` and `â€¦/jobs/{id}/events` (live console).
- A step that exceeds its ceiling becomes **STALLED** (recoverable), never an eternal
  "running". Recover with `â€¦/jobs/{id}/retry`, `â€¦/resume`, or `â€¦/continue`.
- Diagnostic bundle: `GET /api/meta-factory/jobs/{id}/diagnostic`.

### Cost / usage
- Per-user token usage: `GET /api/meta-factory/jobs/usage?period_days=N` (audit B4).
  Apply your per-model price to these measured tokens for billing.

### Capacity tuning
- Thread starvation under load â†’ raise/lower `LDCN_AGENT_WORKERS` (global agent pool).
- Users overloading generation â†’ `LDCN_MAX_CONCURRENT_GENERATIONS` (429 beyond the cap).

### Logs
- Structured request logging is on; LLM provider error strings are redacted (no keys
  in logs). Ship stdout/stderr to your log aggregator.

---

## 7. Known caveats / follow-ups

- **Local artifact materialization** (`generated-projects/`) is an ephemeral build cache.
  The durable source is the configured S3-compatible bucket; missing local projects and
  prepared ZIPs are restored lazily on another instance (audit MF4/H7).
- **Skills are currently preview-only** and do not execute arbitrary code. Reassess
  sandboxing before adding executable third-party skills.
- See `reports/enterprise_audit_2026-06-30.md` for the full remediation status.
