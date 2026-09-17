# LDCN OS · Next UI V2 · Visual language

Source of truth: `design/ldcn-next-ui/styles/tokens.css`, `base.css`, `primitives.css`. Live gallery: prototype `#/system` and `#/brand/identity`.

## 1. Color is evidence

The chrome carries no brand hue. Graphite surfaces, ice ink and one platinum for focus and the selected path. Saturated color appears only when the backend reported a state — and every state also has a distinct glyph shape, so it reads in grayscale, in print and for color-blind viewers.

### Chrome (dark, primary)

| Token | Hex | Role |
|---|---|---|
| `--ground` | `#06080C` | the floor: grid, noise, depth gradient |
| `--surface-1` | `#0B0F15` | workspace surfaces |
| `--surface-2` | `#10151D` | active surfaces |
| `--surface-3` | `#161D28` | focus surfaces |
| `--surface-inspector` | `rgba(14,19,27,.92)` + blur | floating inspector, HUDs, palette |
| `--ice` / `--ice-2` / `--ice-3` / `--ice-4` | `#E6ECF5` / `#A5B0C0` / `#6E788A` / `#414A59` | ink ladder |
| `--platinum` | `#CFD9E8` | brand, focus ring, selected path, critical path |

The light theme redefines every token under `:root[data-theme="light"]` (ground `#EEF1F5`, ink `#0E1420`, platinum `#1B2433`, state colors darkened for contrast). It is fully designed, not inverted.

### The nine state families

| Family | Glyph | Color (dark) | Backend words it covers |
|---|---|---|---|
| proof | filled circle + check | `#3ED598` | PASSED, READY, VERIFIED, CERTIFIED, FINISHED, observed, ready |
| pulse | ring with arc (arc turns only while live) | `#62B4FF` | RUNNING, TESTS_RUNNING, BUILD_RUNNING, starting, health_checking, running_tests |
| caution | triangle | `#F4B740` | approved_with_warnings, WARNING, QUALIFIED, outdated |
| fault | rounded square + × | `#FF5F66` | FAILED, BLOCKER, failed, vulnerable, REFUSED |
| hand | diamond | `#FF4FA0` | NEEDS_USER_ACTION, PROMPT_READY, NOT CHOSEN, Planned — *a human must act* |
| idle | dashed ring | `#7E8898` | QUEUED, PENDING, not_executed, NOT_RUN, EXPERIMENTAL |
| stop | ring + pause bars | `#9AA3B2` | PAUSED, stopped |
| na | dash | `#414A59` | SKIPPED_AFTER_FAILURE, unsupported |
| unknown | dotted ring + ? | `#8A93A3` | an unmapped word or a missing read |

Mapping lives in `components.js → fam()`. A word the map does not know renders as **unknown**, never as proof.

**Rose is reserved.** The hand family is the only rose in the product. It marks "a decision waits on you" (decision chip, rail count, delivery gate). The logo stays monochrome inside the product for that reason.

## 2. Typography

| Face | Use | Settings |
|---|---|---|
| **Instrument Sans** (variable width 75–100) | interface, titles, prose | display 64/560 at width 88; h1 28/580; h2 18/600; body 14/400 |
| **Martian Mono** (variable width 75–112.5) | readouts, backend state words, eyebrows, code | tabular numbers; uppercase eyebrows at 10px, tracking .14em |

Both load from Google Fonts with system fallbacks (`Segoe UI Variable`, `Cascadia Mono`, `SF Mono`…).

Rules: backend state words are shown in mono caps as the backend writes them (`TESTS_RUNNING`), never paraphrased inside a badge; prose around them is sentence case; technology names use tech tags in the UI face.

## 3. Depth layers

| Layer | Token | Used by |
|---|---|---|
| 0 Ground | `--ground` + dot grid + noise | page background, canvases |
| 1 Workspace | `--surface-1` | panels, lists |
| 2 Active | `--surface-2` + `--shadow-1` | rows, nodes, cards in use |
| 3 Focus | `--surface-3` + `--shadow-3` | selected node, focused card |
| 4 Floating inspector | `--surface-inspector` + blur 18 + `--shadow-float` | inspector, HUD, dock, tour bar |
| 5 Overlay | `--overlay` + blur 6 | palette, mobile sheets |

No colored border rails, no identical shadow stamped on every block: border, fill and shadow are spent by role.

## 4. Background identity

- **Dot grid** at 24 px, masked toward the edges.
- **Engineering coordinates** in canvas corners (`X 0330 · Y 0466 · 100%`) — orientation only, they follow pan and zoom.
- **Noise** (SVG turbulence, 3.5% opacity) kills the flat-black look.
- **Depth gradient**: a soft lift at the top of the ground.
- **Focus halo** behind whatever holds attention.

No neon, no scanlines, no cyberpunk.

## 5. The sixteen primitives

| Primitive | Look | Backend source |
|---|---|---|
| Node (station) | dial with family ring; gate = rotated rounded square | `GenerationJob.status`, room status, delivery |
| Edge | proof / live / declared (dashed) / blocked / critical (platinum) | `dependency_job_ids`, topology edges, reporting lines |
| Stage (mission line) | ten points, phase split after Define | stations per project |
| Signal | nine glyphs | any status word |
| Evidence | kind glyph + label + exit/HTTP/duration | `Evidence.kind`, `status`, `exit_code`, `http_status`, `duration_ms` |
| Agent | role glyph inside a five-segment certification ring | `TeamPositionView`, `CertificationView`, cognitive run axes |
| Team | soft zone with mandate | `VirtualCompanyView.teams` |
| Service | icon, tech, port, state, probe readouts | `ServiceNode.type` + probes |
| Artifact | file chip with path | `artifact`, `artifact_sha256` |
| Decision | rose diamond seal | delivery, change request, room approval |
| Gate | two posts and a bar; passed = bar lifted | `required_gates`, checks |
| Timeline event | time · glyph · title · context | `ActivityEvent` |
| Capability | mono competency + depth pips | workforce plan coverage |
| Risk | caution block | impact analysis, gaps |
| Cost | readout with scope | `GenerationUsageSummary` (account only) |
| Status | badge: glyph + backend word | every state |

## 6. Components

Buttons (primary platinum, ghost, quiet, **hand** for decisions), segmented controls, switches, fields, chips, tech tags, capability chips, gap notes (`G6 · no per-service latency history`), inspector (identity, facts, relationships, evidence, actions, technical details with copy), command palette (context-aware commands + grouped search), toasts that say exactly what happened ("Decision recorded — prototype only, nothing was sent").

## 7. Layout and responsiveness

- **Desktop (1280–1900)**: rail 60 px, context bar 52 px, stage up to 1560 px, inspector floats at 380 px.
- **Ultrawide (≥1900)**: the inspector docks beside the stage instead of covering it; pages drop the max width at ≥2200.
- **Tablet (721–1180)**: multi-column screens collapse to two; palette button becomes an icon.
- **Phone (≤720)**: rail and strip give way to a five-tab bar; inspector becomes a bottom sheet; canvases stay pannable; dedicated mobile screens (`m-command`, `m-mission`, `m-actions`) are designed on their own.
- Every page keeps a ≥16 px side gutter; only tables, diagrams and code scroll horizontally, inside their own containers. Verified with no horizontal overflow at 390 px.

## 8. Accessibility

Glyph shapes carry state without color; badges include the word; focus ring is a 2 px platinum outline; graph nodes are focusable buttons (Enter = inspect, Shift+Enter = open), canvases accept arrow keys and +/−/0; `prefers-reduced-motion` and the in-app toggle remove transitions; the palette and inspector close with Escape and return focus.
