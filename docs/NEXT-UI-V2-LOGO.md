# LDCN OS · Next UI V2 · Logo

Live: prototype `#/brand`. Code: `design/ldcn-next-ui/js/brand.js` (`mark`, `markFor`, `wordmark`, `lockup`, `appIcon`, `favicon`, `DIRECTIONS`).

## 1. Final mark: Signal Path

Three primitives of the product's own visual language, drawn as one gesture:

- a **node** — the idea (circle, r 4.4 on a 48 grid)
- an **edge** — the work (stroke 4.4, descends, turns with radius 9, runs right)
- a **gate** — the proof that lets it through (diamond, 13.2 diagonal, centred on the edge's axis y = 37)

It is the mission map reduced to its shape: Define descends, the work turns and runs to the gate. The main screen and the mark tell the same story, which is why the mark needs no letters to be ownable.

### Construction (48-unit grid)

```
node   circle  cx 14  cy 10  r 4.4
edge   M14 16.6 V28 a9 9 0 0 0 9 9 h7      stroke 4.4, round caps and joins
gate   M37 30.4 L43.6 37 L37 43.6 L30.4 37 z
```

The node's centre sits on the edge's vertical axis (x = 14); the gate's centre sits on the edge's horizontal axis (y = 37).

### Sizes are redrawn, not scaled

| Size | Change |
|---|---|
| 48 and up | master geometry |
| 24 (rail, header) | stroke 2.8 (≈ 5.6 on the 48 grid), node r 2.8, gate enlarged |
| 16 (favicon) | stroke 2.25, node r 2.2, gate 5.9 diagonal so the diamond survives |

## 2. Color

| Context | Node + edge | Gate |
|---|---|---|
| Inside the product (rail, header, sign-in) | `currentColor` (ice on dark, ink on light) | **same as the ink** |
| Marketing lockup, app icon, favicon | ice `#E6ECF5` / ink `#0E1420` | rose `#FF4FA0` on dark, `#D6247A` on light |

Inside the product rose means "a decision waits on you". A rose gate in the chrome would say that permanently, so the in-product mark is monochrome.

## 3. Lockups and deliverables

- **Horizontal lockup**: mark + `LDCN` (Instrument Sans 640, width 92) + hairline + `OS` (Martian Mono, 62%). Gap = 0.42 × mark size.
- **App icon** (128): graphite tile with a top light, chromatic mark.
- **Favicon** (16 / 32): graphite rounded square, chromatic mark.
- **Sidebar mark**: 24 px monochrome in a 40 px rail tile.
- All shown on dark and light in `#/brand/sizes`.

## 4. The five directions explored

Each direction was drawn as symbol, wordmark lockup, small icon, sidebar mark and favicon, on dark and on light (`#/brand` → *Cinco direções exploradas*).

| Direction | Idea | Strengths | Weaknesses | Verdict |
|---|---|---|---|---|
| **A · Relay** (connected nodes) | an orchestrator hands work to two teams; one reaches a gate | says "company" and "coordination" | generic org chart; blob at 16 px; five parts | rejected; its vocabulary survives |
| **B · Settle** (engineering signal) | a step response climbing through gates to a measured point | precise, legible at 16 px | reads as a growth chart (fintech); says "going up", not "proven" | rejected; informed the stroke system |
| **C · Core** (modular core) | an OS core inside an open frame with an interface leaving | strong "OS" reading, solid silhouette | close to generic chip icons; no progression, no proof | rejected |
| **D · Waypoint** (mission path) | an idea descends into the work and arrives at a gate | owns the mission map; three parts; no AI cliché | sharp elbow felt mechanical; gate sat too high | **selected, refined into Signal Path** (rounded turn, gate on the axis) |
| **E · LN Grid** (monogram) | one stroke drawing L into N | letter-based, corporate-safe | reads "LN", not LDCN; says nothing about proof; zigzag at 16 px | rejected |

Avoided on purpose: brains, robots, sparkles, hexagons, infinity loops, chat bubbles.

## 5. Misuse

- Do not colour the gate rose inside the product chrome.
- Do not rotate or mirror: the path always descends and turns right, like the map.
- No glow, particles or "AI" gradients.
- Do not use the node alone as a status indicator — states have their own glyphs.

## 6. Brand illustration

The sign-in screen draws the story once on load (≈1.5 s, then rests; static with reduced motion): Idea → Architecture → Company → Code → Evidence → READY. It is an illustration of what LDCN does, not an activity indicator.
