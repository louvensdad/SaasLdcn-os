# LDCN OS · Next UI V2 · Motion

Live demos: prototype `#/motion`. Tokens: `styles/tokens.css`. Router transitions: `js/core.js → render()`. Canvas motion: `js/graph.js`.

## 1. Principle: the interface animates the change, never the wait

Motion is allowed for navigation, context switches, the arrival of real evidence, a real state change, panels, graph expansion, topology change, zoom and focus, and feedback to a gesture. It is **forbidden** for anything that pretends work is happening:

- an agent "thinking", typing, or an animated avatar
- a progress bar without a real percentage from the backend
- a spinner looping without a request in flight
- a test "running" without `TESTS_RUNNING` / `running_tests`
- a service "starting" without the `starting` state
- a build "progressing" without a reported stage
- an AI provider "thinking"
- metrics that count up by themselves

The only continuous animations in the prototype are the **pulse arc** and the **breathing ring**, and both render only while a station or service is in a running state reported by the (recorded) backend.

## 2. Four levels

| Level | Range | Token | Easing | Used for |
|---|---|---|---|---|
| L1 · Micro | 100–180 ms | `--m1` 140 ms | `--ease-out` cubic-bezier(.2,.8,.2,1) | hover, press (scale .97), focus, copy |
| L2 · Context | 180–280 ms | `--m2` 230 ms | `--ease-out` | inspector, sheets, tabs, filters, toasts |
| L3 · Structural | 250–450 ms | `--m3` 380 ms | `--ease-structural` cubic-bezier(.16,1,.3,1) | graph expand/collapse, reflow, stage change, gate lifting, camera focus |
| L4 · Cinematic | 400–700 ms | `--m4` 580 ms | `--ease-structural` | entering a mission, opening the control room — rare |

Nothing routine exceeds one second. `--decay` (1.6 s) is not a motion: it is how long a fresh signal keeps its glow before resting.

## 3. Microinteractions (all nine are playable in `#/motion`)

| Microinteraction | Trigger | Motion |
|---|---|---|
| Button press | pointer down | scale .97, L1 |
| Copy confirmation | copy an id in Technical details | icon becomes a check with a pop, L1; toast "Copied to the clipboard" |
| Gate pass | a required gate reports passed | the bar lifts from horizontal, L3 |
| New evidence arrival | evidence observed | the item glows and settles over 1.6 s |
| Service ready | probe answered | breathing ring stops; one proof glow, L3 |
| Decision submitted | owner records a decision | rose diamond turns into proof; the queue item slides out; next decision is selected |
| Agent assignment | composition received | seats fill with a staggered rise (the response arrived whole; the stagger is a reveal, not progress) |
| Filter transition | filter chip | items that no longer match collapse, L2 |
| Zoom focus | selecting a node / "focus" | camera tweens to the node, L3 |

## 4. Live signals decay

The signal strip at the bottom of the shell shows the latest events. A new one enters with a platinum glow, rests after 1.6 s and stays in the history. Nothing blinks in a loop.

## 5. Replay: showing motion honestly in a prototype

The prototype has no live backend, so it cannot show real transitions as they happen. Instead the **replay dock** steps through nine *recorded* state changes of Mission #3F-C (`fixture.js → replay`): tests running (11:14) → tests passed → production build passed → package created / test room started → PostgreSQL ready → Backend healthy → Frontend healthy → browser E2E passed → Mission READY (11:27).

Each step is a state the backend reports. The UI animates the **difference** between two states (station ring settles, edge turns green, service glows once, signal arrives) and then rests until the next step. Play, step back, step forward and reset are all available. Screens that listen: Mission Command Center, Mission Canvas, Runtime Control Room, the cover page map.

## 6. The six screen transitions

Implemented with the View Transitions API: the element you clicked gets `view-transition-name: hero`, the destination marks its hero with `data-hero`, and the browser morphs one into the other at L4. Without the API, or with reduced motion, the new screen simply appears (a 230 ms fade).

| Transition | From element | To element | Demo |
|---|---|---|---|
| Command Center → Mission | the project's mission line | mission title | `#/app/command?demo=1` |
| Mission → Agent | the Backend Engineer seat ring | agent identity ring | `#/app/mission?demo=agent` |
| Mission → Runtime | the runtime chain | topology canvas | `#/app/mission?demo=runtime` |
| Runtime → Evidence | health evidence panel | evidence graph | `#/app/runtime?demo=1` |
| Evidence → Test | the pytest evidence node | Test Room title | `#/app/evidence?demo=1` |
| Action Center → Decision | queue item title | decision title | `#/app/actions?demo=1` |

Graph-level transitions (no route change): expanding stages grows substeps out of their station and reflows the run; switching company lines swaps reporting lines for hand-offs; collapsing an evidence pillar folds its items back into it. Nodes travel with CSS transforms, edges morph with the CSS `d` property, new edges draw in, removed nodes fade out.

## 7. Reduced motion

`@media (prefers-reduced-motion: reduce)` and the in-app toggle (`data-motion="reduced"`) set all four durations and the decay to zero, clamp every animation to a single frame, skip view transitions, and make canvas camera moves instant. State stays readable because it never depended on motion: glyph shape + word + color.
