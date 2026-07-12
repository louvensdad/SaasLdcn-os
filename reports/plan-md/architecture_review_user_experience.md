# Architecture Review — User Experience

## Objective
The user should not feel they clicked "Next." They should feel they received a senior architect's technical opinion before investing hours of development.

## How the UX delivers that
1. **Journey timeline** at the top — derived from the real room status — shows Project Room ✓ · PromptMaster ✓ · Architect ✓ · **Architecture Review ●** · Meta-Factory ○. The user sees exactly where they are.
2. **Executive summary** — large cards: project, architecture, backend/frontend/database/deploy, complexity (with its basis), readiness %, and origin (AI vs deterministic). Scannable in seconds.
3. **Engineering readiness** — an honest coverage bar (`N/10 areas decided`) + security presence + spec confidence. No fake letter grades; the user trusts it *because* it doesn't overclaim.
4. **Architecture diagram** — request-flow of the **actually decided** areas; each node is clickable and scrolls to its decision.
5. **Decisions & trade-offs** — one card per decision: the choice, **why** (justification), and the **alternatives weighed**. This is the "an architect explained their reasoning" moment.
6. **Risk center** — real open questions and assumptions, each with why-it-matters and a default/mitigation. Honesty about uncertainty builds confidence, not doubt.
7. **Engineering approval panel** — an advisory verdict (caution if open questions exist; warning if deterministic), then deliberate actions: Edit PromptMaster · Back to Architect · **Approve & send to Meta-Factory**.

## Craft
- Engineering Runtime design system: glass surfaces, generous spacing, mono data type, gradient accents — consistent with the rest of the platform.
- Accordion/card layouts instead of dense tables; no walls of text.
- Accessibility: semantic headings, keyboard-reachable controls, focus rings, `aria-hidden` on decorative icons, `role="alert"` on errors, reduced-motion respected.
- Responsive grids (mobile → ultrawide).

## The trust mechanism
The page earns trust by **refusing to fabricate**. Where a senior architect would say "we don't have enough information to estimate cost yet," this page says **"Informação ainda indisponível"** — which reads as rigor, exactly the opposite of a templated dashboard.
