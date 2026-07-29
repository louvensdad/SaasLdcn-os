# LDCN OS — Enterprise Platform Refactor

_Vision: shift LDCN OS from "code generator" to "AI-assisted software-engineering platform."_
_This document covers the first autonomous increment and the honest roadmap for the rest._

## 1. Analysis of the existing architecture

- **The journey was Builder-centric.** Post-login dropped the user straight into `/dashboard`; the wizard/builder dominated. There was no "platform" framing — it read as a tool, not a factory.
- **Real, working modules already exist:** Project Rooms (`/project-rooms`), Meta-Factory (`/meta-factory`, live agent pipeline), Modernize/Lab (`/modernize`), Architecture (`/architecture`), Wizard, Templates, Projects, Dashboard, System Status.
- **Several vision modules have NO backend:** Deploy Center (AWS/Azure/GCP/…), Analytics BI (world heatmaps, per-agent cost/latency telemetry), and real-time agent cost/token streams. The route audit confirmed no endpoints exist for these.
- **Redundancy:** navigation was a flat 12-item list with no sense of a journey or hierarchy.

## 2. The governing constraint

The brief is emphatic: **"Jamais fingir inteligência. Nunca utilizar templates. Nenhuma funcionalidade implementada apenas para parecer inteligente."** That rule decides scope: anything requiring data/AI that doesn't exist must **not** be faked. So this pass builds the part of the vision that is **real and additive**, and documents the rest as a backed roadmap rather than shipping hollow screens.

## 3. What was built (this increment)

**Module 1 — Mapa Inteligente / cinematic platform entry** (`/platform`)
- New immersive entry: a luminous **LDCN ENGINE** core with module nodes arranged radially, connected by animated signal edges (cyan→blue gradient, flowing dash), particle ambient backdrop, hover-glow, focus-driven edge highlighting, staggered entrance, and reduced-motion fallbacks.
- **Every node routes to a real module** — Project Room, Architect, Meta-Factory, Lab, Templates, Library, Panel, Builder. **No fictional Deploy/Analytics nodes** (they'd be dead ends).
- Responsive: cinematic radial stage on desktop; a clean card grid (same destinations) on tablet/mobile.
- Wired as the **post-login landing** and the **top navigation item**, so the platform — not the builder — is now the front door.

**Supporting changes**
- `components/platform/platform-map.tsx` (new), `app/(app)/platform/page.tsx` (new).
- `lib/navigation.ts`: Platform added as the first nav entry.
- `app/login/page.tsx`: post-auth redirect → `/platform`.
- `components/shell/app-shell.tsx`: topbar copy for `/platform`.
- i18n: `platform.*`, `navigation.platform.*`, `shell.platform.*` (en-US + pt-BR).
- Reuses the established Engineering Runtime design system (tokens, glass, `t-*` type, AmbientBackdrop).

**Validation:** `tsc --noEmit` clean; `/platform` compiles and renders (HTTP 200); reduced-motion + keyboard focus handled; no fake data.

## 4. Deliberately NOT built (and why)

| Vision module | Status | Reason / requirement |
|---|---|---|
| Deploy Center (11 providers) | deferred | No deploy backend. Needs provider integrations + credential vault + job runner. |
| Analytics BI (heatmaps, cost/latency) | deferred | No telemetry store. Needs event capture + `GET /analytics/*`. |
| Per-agent live cost/tokens | deferred | Meta-Factory streams stages, not cost. Needs cost accounting in the stream. |
| Architect Engine as a *separate* step | partial | Blueprint logic exists under `/architecture`; promoting it to a first-class journey stage is a follow-up. |
| Cinematic per-node preview videos | deferred | No assets; would be placeholder media. |

Building any of these now would violate the no-fake-data rule.

## 5. Gains

- **UX:** the platform reframes as a factory with a clear journey spine; entry cognitive-load drops from a 12-item list to a single visual map; <3s "where am I / what can I do."
- **Technical:** zero new backend coupling; pure additive navigation layer; fully token-driven and reduced-motion-safe.
- **Engineering:** reversible (the dashboard and all routes are intact); no destructive changes.

## 6. Roadmap (honest, backed)

1. **Architect Engine** as an explicit journey stage between Project Room → Meta-Factory (surface the existing blueprint with justifications/trade-offs/confidence already in the backend).
2. **Agent identity in Meta-Factory** — give each pipeline role a card with status/logs/files/tokens (tokens already partially in the stream).
3. **Analytics** — start with what's real (projects, readiness, generation outcomes) before any BI that needs new telemetry.
4. **Deploy / cost** — only after the corresponding backends exist.

## 7. Risks

- **Entry-flow change:** post-login now lands on `/platform`. Mitigated: dashboard remains one click away (node + nav). Fully reversible by reverting the login redirect.
- **Persisted theme/journey:** none affected; this is additive.
- **Scope creep:** the vision is multi-month; shipping it as hollow screens would erode trust. This increment intentionally ships one complete, real piece.

## 8. Next steps

Confirm the entry-flow change feels right, then proceed module-by-module down the roadmap — each only when its data is real.
