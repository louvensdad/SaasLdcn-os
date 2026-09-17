# LDCN OS · Next UI V2 · Vision

> **Implementation status: `NOT_STARTED_WAITING_FOR_OWNER_APPROVAL`**
> This is a design proposal with a clickable prototype (`design/ldcn-next-ui/`).
> No production code, route or backend contract was changed. `apps/web` and `apps/web-next` are untouched. No commit, no push.

## 1. The thesis

The first rebuild (`apps/web-next`, 55/55 destinations) made the product complete and honest, but it still *displays* the system: cards, tables, lists and endpoint text. V2 *draws* it.

**From idea to proof, in view.** Every mission is a path from an idea to a gate. Every company is an org chart of certified seats. Every runtime is a topology with probes. Every verdict is a graph you can walk down to the command that proved it. Each shape is fed by a field the backend already serves; where no field exists, the shape stays empty and names the gap.

The signature is the **mission map**: the Define stations descend in a column, the work turns and runs to a rose gate — the same gesture as the new logo, *Signal Path*. The product's main screen and its mark tell one story.

## 2. Truth rules (non-negotiable)

| Rule | What it means in the UI |
|---|---|
| **Animation ≠ activity** | Nothing spins, breathes or "thinks" unless the backend reports a running state (`RUNNING`, `TESTS_RUNNING`, `starting`, `health_checking`…). Motion answers a change; it never fills a wait. |
| **Color is evidence** | The chrome is graphite and ice. Saturation only appears for a reported state, and every state also has its own *shape* (proof = filled check, pulse = arc, caution = triangle, fault = square, hand = diamond, idle = dashed ring…). |
| **Gaps are drawn** | Per-service latency (G6), per-mission cost (G19), research sources (G3), pending-decision aggregate (G4) and project aggregate (G5) have no read model. The UI shows a dashed, named placeholder — never an invented number. |
| **IDs are technical details** | Screens say "Inventory Lite · Mission #3F-C". `genjob_bad8f38bd07344`, room ids and endpoints live in the inspector's *Technical details* (collapsed unless developer mode is on). |
| **Technology names are never translated** | Next.js, FastAPI, PostgreSQL, pytest… appear verbatim, in the UI face as tags. |
| **Only real metrics, with scope** | "42/42 tests · Inventory Lite #3F-C", "US$ 0.93 · account · last 24 h · estimate". No "efficiency %", no health scores. |

## 3. Invariants V2.1–V2.20 and how the prototype honors them

| # | Invariant | Where to verify |
|---|---|---|
| V2.1 | Visualize systems, not lists | Mission map, company graph, runtime topology, evidence graph, technology graph, architecture map, library universe |
| V2.2 | No fake progress | Replay dock animates recorded transitions only; Test Room "Run again" says a real run streams stages |
| V2.3 | No fake metrics | Proof panel metrics carry their scope; cost per agent is an empty readout + G19 |
| V2.4 | No fake agents | Seats come from `TeamPositionView`; no avatars, no typing, no chat bubbles |
| V2.5 | No chain-of-thought | Agents show certification, jobs, tools and evidence — never "reasoning" |
| V2.6 | Tech names never translated | Tech tags everywhere; locale only affects prose |
| V2.7 | IDs secondary | Inspector → Technical details; developer toggle in the context bar |
| V2.8 | Endpoints are developer details | Same; plus the product map chapter for design review |
| V2.9 | Mission is a visual object | Mission map (command + full canvas with stages, jobs and evidence layers) |
| V2.10 | Company is a visual object | Virtual Company graph: teams as zones, reporting lines, hand-offs |
| V2.11 | Runtime is a topology | Runtime Control Room: lanes, services, probes, startup order, failure state |
| V2.12 | Evidence is a graph | "Why is it READY?": verdict ← pillars ← evidence ← artifacts |
| V2.13 | Certification is explorable | Roles × axes matrix, axis explorer, stacks, compositions |
| V2.14 | Current frontend does not constrain V2 | Navigation and screens were redrawn from backend capabilities |
| V2.15 | Backend truth constrains V2 | Every fixture field mirrors a served field (see Visualization System doc) |
| V2.16 | Mobile designed independently | Home / Mission / Actions phones with sheets |
| V2.17 | Reduced motion respected | OS preference + in-app toggle; transitions become cuts |
| V2.18 | Logo works from favicon to marketing | Brand chapter: 16 / 24 / 32 / 128 / header / marketing, dark and light |
| V2.19 | Production only after approval | Status shown on every proposal page |
| V2.20 | One story everywhere | Single `DESIGN_FIXTURE`: Inventory Lite, Mission #3F-C |

## 4. Direction

Four directions were drawn with the same content (see `#/directions`):

- **A · Mission Control** — dense telemetry. Rejected as a whole: invites fake metrics and "activity" animation; tires the people who decide.
- **B · Calm Engineering** — typographic, light, one column. Rejected as a whole: systems collapse back into text.
- **C · Engineering OS** — panes, tabs, keyboard. Rejected as a whole: becomes an IDE clone and excludes approvers.
- **D · LDCN Signature (chosen)** — graphite and ice, the mission map as signature, color only from state, depth layers, a floating inspector. It keeps A's decaying live signals and mono readouts, B's situation sentences and breathing room, C's command palette and multi-panel workbench.

## 5. The shell

- **Rail** (global places): Command Center, Projects, Action Center (rose count), Activity, Virtual Company, Engineering, Runtime, Certification, Library; Settings at the foot.
- **Context bar**: workspace, breadcrumb, `Ctrl K` palette, decisions chip, provider chip, developer / motion / theme toggles.
- **Project scope** (inside a project): Cockpit · Mission · Company · Workbench · Runtime · Evidence · Delivery.
- **Stage** with a **floating inspector** (docks beside the content on ultrawide screens).
- **Signal strip**: the latest real events; a new one glows and settles in 1.6 s.
- **Replay dock** on mission, canvas and runtime screens: steps through recorded state changes.
- **Mobile**: five tabs (Home, Mission, Actions, Activity, Account) and bottom sheets.

## 6. What the owner is asked to evaluate

Visual identity · Navigation · Command Center · Mission · Company · Engineering · Runtime · Evidence · Motion · Logo · Mobile. The `#/approval` page lists each with where to look, and produces a summary to paste in the chat.

## 7. Related documents

- `NEXT-UI-V2-VISUAL-LANGUAGE.md` — tokens, states, primitives, depth, components
- `NEXT-UI-V2-MOTION.md` — levels, microinteractions, transitions, replay, reduced motion
- `NEXT-UI-V2-LOGO.md` — Signal Path, the five directions, usage
- `NEXT-UI-V2-SCREEN-MAP.md` — every screen, route, read and interaction
- `NEXT-UI-V2-VISUALIZATION-SYSTEM.md` — backend as product map, canvas engine, each drawing
- `NEXT-UI-V2-PROTOTYPE-REVIEW.md` — how to open, what was verified, limits, approval gate
