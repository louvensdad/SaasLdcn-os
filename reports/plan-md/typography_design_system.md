# Typography & Content Design System

**Branch:** `feat/premium-foundation` · **Date:** 2026-06-28
**Validation:** web `tsc` clean · `next build` clean (26/26).

## Goal
Give the whole platform one Enterprise-grade typographic hierarchy so the user instantly distinguishes titles, decisions, metrics, recommendations, risks, and documentation — and no screen reads as a wall of text. This is **not** a colour change; it is a shared typography + content system.

## What was built (the foundation)

### 1. Official scale — `.ds-*` utilities (`app/globals.css`)
A single source of truth replacing the two overlapping legacy scales (`.t-*` and `.type-*`):

| Token | Size | Line-height | Use |
|-------|------|-------------|-----|
| `ds-display` | 48px (clamp) | 1.1 | hero numbers |
| `ds-page-title` | 34px (clamp) | 1.2 | page H1 |
| `ds-section` | 26px (clamp) | 1.2 | section H2 |
| `ds-card-title` | 20px | 1.2 | card H3 |
| `ds-subsection` | 18px | 1.2 | accordion / subsection |
| `ds-body-lg` | 16px | 1.65 | lead paragraph |
| `ds-body` | 15px | 1.65 | body |
| `ds-body-sm` | 14px | 1.65 | dense body (secondary colour) |
| `ds-caption` | 13px | 1.5 | captions |
| `ds-label` | 12px | 1.4 | uppercase labels (+tracking) |
| `ds-code` | 13px mono | 1.5 | inline/blocks |
| `ds-badge` | 12px | 1 | badges |
| `ds-metadata` | 11px mono | 1.45 | provider/model/tokens/hash |

Plus **text-colour levels** (`ds-text-primary/secondary/muted/success/warning/danger/info`) and an `--info` + `--text-secondary` token, so greys are never arbitrary. Long copy gets a comfortable measure via `.ds-prose` (`max-width: 72ch`).

Body never drops below 15px and headings use `clamp()` — comfortable on notebook → ultrawide without shrinking below the minimum.

### 2. Shared `Engineering*` components (`components/engineering/ds.tsx`)
One client module exporting the full set the brief asked for:
`EngineeringTitle, EngineeringSection, EngineeringSubtitle, EngineeringParagraph, EngineeringLabel, EngineeringCard, EngineeringBadge, EngineeringChips, EngineeringMetric, EngineeringMetricGrid, EngineeringMetadata, EngineeringDecision, EngineeringTradeoff, EngineeringRecommendation, EngineeringWarning, EngineeringSuccess, EngineeringChecklist, EngineeringCode (copy + collapse), EngineeringAccordion (each section opens individually), EngineeringTimeline, EngineeringTable`.

All consume the `.ds-*` classes — no inline font-size, no arbitrary greys. Badges are taller with more horizontal padding; chips are spaced (`EngineeringChips` gap); cards have real internal breathing room (`p-6`); metrics share one layout; the accordion replaces walls of deep-analysis text with per-section expansion; `EngineeringDecision` renders an architecture decision as Choice → Motivo → Benefícios/Trade-offs → Alternativas (the "write like an architect, not an article" format).

### 3. Audit (`scripts/audit-typography.mjs`)
Detects DS bypasses: inline `fontSize`, arbitrary `text-[13px]`, hardcoded greys (`text-gray/slate/zinc-*`), and the legacy `.t-*`/`.type-*` scales. Run: `node scripts/audit-typography.mjs` (summary) or `--report` (writes `apps/web/reports/typography_audit.md`).

## Honest status — foundation done, rollout staged

This change delivers the **system** and a **reference conversion**, not a full 18-page rewrite. The audit gives the exact, honest baseline:

| Rule | Count |
|------|-------|
| inline-font-size | **0** (the codebase already avoided inline styles) |
| arbitrary-text-size (`text-[Npx]`) | 56 |
| hardcoded-grey | 22 |
| legacy-scale (`.t-*` / `.type-*`) | 204 |
| **Total** | **282** (across 51 files) |

- **Converted as the reference:** `components/project/blueprint-response-viewer.tsx` (now 100% Engineering components — badges, metadata, code, paragraph).
- **Not yet converted:** the ~18 listed pages still use the legacy scale. They are not broken — the legacy `.t-*`/`.type-*` classes still exist — but they don't yet share the new hierarchy. Migrating them is mechanical: replace `t-h2/type-section` → `ds-section`/`EngineeringSection`, `t-body` → `ds-body`, `t-caption` → `ds-caption`, `text-gray-400` → `ds-text-secondary`, and lift repeated badge/metric/decision markup into the Engineering components. The audit count is the burn-down metric.

## Recommended rollout order (highest visual impact first)
Engineering Review → Architect → Project Room → Meta-Factory → Analytics → Documentation → Dashboard → the rest. Convert a page, re-run the audit, watch the count fall to 0.

## Files
**New:** `components/engineering/ds.tsx`, `scripts/audit-typography.mjs`, `apps/web/reports/typography_audit.md`.
**Modified:** `app/globals.css` (DS scale + tokens), `components/project/blueprint-response-viewer.tsx` (reference conversion).
