# Deep Codebase Analysis — Validation

**Engine:** `engines/modernize_analysis_engine.py` (reuses `codebase_analysis_engine`).

## Coverage
The deterministic analysis walks the ingested codebase (read-only, never executed) across:
architecture (folder structure, layering, smells), backend (controllers vs service layer),
frontend (components signal), database (schema/migrations/.sql), security (secret scan: AWS
keys, private keys, generic api_key/secret/token, hardcoded passwords, dangerous eval),
dependencies (legacy Django/Flask/React/Express), tests (presence), DevOps (Dockerfile/CI/env).

## Scores (10 dimensions, 0–100, deterministic)
Arquitetura, Segurança, Backend, Frontend, Banco, Testes, DevOps, Manutenibilidade,
Performance, Prontidão para produção, plus an `overall` average. Derived from presence/absence
signals + severity-weighted secret penalties. Documented as heuristic.

## Two reports
- **Executive** (`ExecutiveReport`): health, risk level (low/medium/high), top problems,
  business impact, effort estimate, priority.
- **Technical** (`TechnicalReport`): `CodeIssue[]` with file, line (when known), severity, root
  cause, recommendation, and `auto_fixable`.

## AI mode (honest)
Scores + reports are always produced **deterministically** (works offline). A user key adds a
best-effort LLM narrative for the executive `business_impact`; if no real LLM contributes,
`degraded=true`. The product never fakes AI.

## Endpoints
`POST /modernize/{id}/analyze` (key optional) → `{ report, plan }`; `GET /modernize/{id}/report`.

## Tests
`test_analysis_generates_executive_and_technical_reports`: executive health + risk present,
technical issues ≥ 1 (hardcoded secret reported), security score < 100.
