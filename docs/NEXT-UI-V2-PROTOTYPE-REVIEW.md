# LDCN OS · Next UI V2 · Prototype review

> **Implementation status: `APPROVED_IN_PROGRESS`** — approved on 2026-09-16; progress, deviations and gates in `NEXT-UI-V2-IMPLEMENTATION.md`.

## 1. How to open it

| Where | How |
|---|---|
| Private artifact | https://claude.ai/artifact/EcjGuzxcJVFvjWvvmaqhxe (share only if you choose to) |
| Locally | `python design/ldcn-next-ui/serve.py` → http://127.0.0.1:4620/ (or the `ldcn-next-ui-v2` entry in `.claude/launch.json`) |

The prototype is static: vanilla ES modules, no build step, no request leaves the page. Everything shown comes from `js/fixture.js` (`DESIGN_FIXTURE`, Inventory Lite story). Preferences (theme, motion, developer details, approval marks) stay in the viewer's browser.

Start at `#/` and press **Começar a apresentação**: a tour bar walks the 17 steps in the requested order and follows you between screens.

## 2. Presentation order

| Step | Route | What to look at |
|---|---|---|
| 1 New LDCN logo | `#/brand` | construction, marketing lockups |
| 2 Brand identity | `#/brand/identity` | palette where color is evidence, nine states by shape, type, glyphs, misuse |
| 3 New shell | `#/app/project` | rail, context bar, project scope, stage, inspector, signal strip, `Ctrl K` |
| 4 Command Center | `#/app/command` | mission lines, waiting queue, scoped proof |
| 5 Project Cockpit | `#/app/project` | anatomy strip, architecture mini-map, missions & changes |
| 6 Mission Command Center | `#/app/mission` | the map (hover, click, double-click, `+`) |
| 7 Mission Map animation | `#/app/mission-canvas?play=1` | replay of recorded state changes; layers |
| 8 Virtual Company | `#/app/company` | reporting lines ↔ hand-offs, certification filter |
| 9 Engineering Workbench | `#/app/workbench` | requirement → proof trace, code, console |
| 10 Runtime Topology | `#/app/runtime` | replay dock, failure state, G6 empty charts |
| 11 Evidence Graph | `#/app/evidence` | verdict ← pillars ← evidence ← artifacts |
| 12 Action Center | `#/app/actions` | record a decision and watch it leave the queue |
| 13 Certification Center | `#/app/certification` | matrix, axis explorer |
| 14 Library | `#/app/library` | knowledge universe, research gap |
| 15 Mobile | `#/mobile` | three phones, tap a station or decision |
| 16 Motion language | `#/motion` | levels, microinteractions, six transitions |
| 17 Before × V2 | `#/compare` | six pairs |
| Gate | `#/approval` | mark each area and copy the summary into the chat |

## 3. What is in the box

- **42 routes**: 31 product screens (the 30 requested mockups plus the Architecture Map), `#/app/actions/:id`, 9 proposal chapters and the mobile overview.
- **6 mandatory drawings**: Mission Map, Virtual Company Graph, Runtime Topology, Evidence Graph, Technology Graph, Architecture Map — all pannable and zoomable, with hover, inspect and enter.
- **6 animated transitions** with `?demo=` entry points; replay of 9 recorded state changes.
- **Themes**: dark (primary) and light, both fully designed. **Reduced motion** via OS or in-app toggle. **Developer details** toggle.
- Code: 6 stylesheets and 15 modules (~7,600 lines). Docs: seven `docs/NEXT-UI-V2-*.md`.

## 4. What was verified

| Check | Result |
|---|---|
| Every route rendered headless (Chromium, 1440 × 900) | 42/42, no console or page errors |
| Horizontal overflow at 390 px (phone) and 1440 px | none on any route |
| Interaction flows (tour start / next / exit, replay play and reset, double-click into runtime, palette search → evidence, pillar expand, inspector open / Escape, requirement trace on the architecture map, company hand-offs, decision recorded leaves the queue, delivery gate passes, runtime failure state, mobile sheet, nine microinteractions, transition demo, approval summary, theme toggle) | all pass, no console errors |
| Light theme on Mission, Company, Command Center, Brand identity | legible, same hierarchy |
| Endpoints named in the fixture and docs | checked against the live OpenAPI dump |

## 5. Known limits of the prototype (not of the design)

- One story only. Other workspaces and projects show their lines and states but open with a note instead of their own screens.
- Some file contents in the Workbench and some diff files in Changes are not in the fixture; the UI says so.
- Canvases on phones are usable but small; the dedicated mobile screens are the intended phone experience.
- Actions (record decision, deploy to staging, test key…) are local simulations with a "prototype only, nothing was sent" toast.
- The replay is a recording; a real implementation subscribes to job events and animates the same differences.
- View Transitions morphs need a Chromium-based browser; elsewhere the screens cross-fade.

## 6. Before × V2

| Before (`apps/web-next`) | V2 |
|---|---|
| Table / cards (Command Center) | visual system: mission lines + decision queue |
| List (Activity) | timeline with episodes and a day map |
| Workforce table | company graph with certification rings |
| Startup-order text | runtime topology with probes |
| Certification table | certification explorer |
| API debug text on screens | technical inspector (ids and endpoints on demand) |

Captures: `design/ldcn-next-ui/assets/before/` (current app with mocked data) and `assets/after/` (prototype).

## 7. Approval gate

Evaluate, and answer in the chat (the `#/approval` page builds the summary):

1. **Visual identity**
2. **Navigation**
3. **Command Center**
4. **Mission**
5. **Company**
6. **Engineering**
7. **Runtime**
8. **Evidence**
9. **Motion**
10. **Logo**
11. **Mobile**

Only after approval: an implementation plan in waves on top of `apps/web-next` (tokens and primitives first, then the canvas engine and the four signature drawings with real data, then the remaining screens), with the backend gaps G3, G4, G5, G6 and G19 scheduled alongside, and route cutover only with proven parity. Until then nothing is implemented, nothing is committed and nothing is pushed.
