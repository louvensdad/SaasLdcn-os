# Architecture Review — Validation

## Static checks
- **Typecheck:** `tsc --noEmit` → clean (exit 0).
- **Production build:** `next build` → success; `/engineering-review` 5.25 kB, `/architect` 2.81 kB; no errors or lint failures.

## No-fake-data audit (the core requirement)
Reviewed every value rendered by the Review Center against its source in `lib/architecture-review/derive.ts`:

| Claim on screen | Backed by | Verdict |
|---|---|---|
| Backend/Frontend/Database/Deploy choices | `blueprint.decisions[area].choice` | ✅ real |
| Justifications & alternatives | `blueprint.decisions[*].justification / alternatives_considered` | ✅ real |
| Complexity band | computed from `entities+workflows+rules+users`, **basis displayed** | ✅ real, justified |
| Readiness % | `spec.confidence` | ✅ real |
| Decision coverage `N/10`, security `covered/total` | counted from real decisions | ✅ real (coverage, not a grade) |
| Risks | `spec.open_questions` + `spec.assumptions` | ✅ real |
| Estimates (entities/workflows/rules/users/decisions/open questions) | spec array lengths | ✅ real |
| Diagram nodes | only decided areas | ✅ real |
| Origin (AI vs deterministic) | `blueprint.degraded` | ✅ real |
| Cost / per-item confidence / token+time+file estimates / generic trade-offs | — none exist — | 🚫 **not rendered** (would be invented) |

A parallel draft of this page fabricated cost (`$80-220`, `$150-500/mo`), per-area confidence (`confidence-4/-5/-8`), fake decisions for undecided areas (OWASP/LGPD/cache…), and generic trade-off text. It was **replaced** with this derive-backed version per the user's decision. Zero fabricated values remain.

## "Unavailable" path
When a field has no real value, the UI renders **"Informação ainda indisponível"** (via `Maybe<T> = T | null` + a `show()` helper) — never a placeholder number.

## Recommended follow-up
- Add a unit runner (vitest) to test `derive.ts` directly (pure functions, no I/O). Not present in the repo today; the functions were written pure specifically to enable this.
