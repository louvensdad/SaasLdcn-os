# Settings — Premium UI Refactor

_Engineering Runtime design system · LDCN OS_

## 1. Problems found (current → why it failed)

- **No hierarchy / "mural de informações".** A single scroll mixed Account, GitHub, GitLab, languages, runtime, health, registry, contracts, themes and architecture as ~12 equally-weighted cards. The eye had no entry point.
- **Technical noise leaked to end users.** Stacks/frameworks/architectures/archetypes/capabilities counts (registry internals) sat next to "delete account" — admin-panel feel, not SaaS.
- **Themes as a cramped pill bar** instead of a previewable gallery.
- **Health reduced to a number** (`92%`) with no breakdown.
- **Off-system color usage** elsewhere in the app (indigo/fuchsia) — addressed in a prior pass; Settings already used tokens.
- **One 433-line component** with three private sub-components and no reuse boundary.

## 2. The hard constraint (and how it shaped the result)

The brief specified 8 tabs **and** an absolute rule: _no fake data, no placeholders, no empty cards, no visibly-disabled features._ Cross-referencing the backend (route audit) showed **about half the requested content has no API**:

| Requested | Backend reality | Decision |
|---|---|---|
| Account, AI keys, Git, Themes, Health, Registry | ✅ real endpoints | **Built** |
| AI **latency / tokens / cost / last-use** | ❌ no endpoints | **Omitted** (would be fabricated) |
| **Workspace** (team/users/limits/storage/invites/logs) | ❌ no concept in backend | **Tab dropped** |
| **Security** sessions/devices/MFA/tokens/audit | ❌ none (only LGPD export/delete/password) | **Folded into Account; MFA/devices dropped** |
| **Runtime** workers/queue/jobs | ❌ none | **Omitted; Runtime shows real health/registry** |
| AI **"test connection"** button | ❌ no test endpoint | **Omitted** (a no-op button is a disabled feature) |

Per the user's decision (**"real-data tabs only"**), the aspirational tabs were **not faked**. Final tab set: **Conta · IA · Git · Interface · Runtime · Avançado**.

## 3. Decisions

- **Tabbed shell** (`max-w-5xl`, generous spacing, one concern per tab) replaces the single scroll — the user sees *where they are / what they can do* in <3s.
- **Registry/technical data gated behind Developer Mode** (Advanced tab toggle), removing it from the default view exactly as requested.
- **Themes → live-preview gallery**: each card renders a real swatch via a `data-theme={id}` subtree, so previews can't drift from the actual palette.
- **Premium Health card**: score + qualitative label (Excellent) + real per-subsystem checks (backend/contracts/topology/projects, driven by query success) + relative "last checked".
- **IA = real key management only**: per-provider status (masked tail), save, remove. Six real providers (Claude/OpenAI/Gemini/OpenRouter/Custom + keyless Ollama). DeepSeek/Llama/Qwen are correctly *not* separate cards (they ride OpenRouter).

## 4. Components removed / created

**Removed (from Settings):** the flat `SecurityPrivacyCard` block, the inline `ThemeSwitcher` pill bar usage, and the always-visible `ArchitectureGraphSurface` registry panel.

**Created (reusable):**
- `components/ui/tabs.tsx` — WAI-ARIA tabs (roving tabindex, Arrow/Home/End, `layoutId` sliding indicator, cross-fade panels, reduced-motion safe).
- `components/settings/theme-gallery.tsx` — live-preview theme cards, stagger entrance.
- `components/settings/ai-providers-tab.tsx` — provider key cards (React Query status + set/remove mutations).
- Upgraded primitives reused here: `Button` (loading/disabled), `Input` (focus-glow/error), `Tooltip`, glass/`t-*` typography utilities.

**Refactored in place:** `AccountTab`, `GitTab`/`GitProviderCard`, `InterfaceTab`, `RuntimeTab`/`HealthCard`, `AdvancedTab` — all reusing existing real data hooks.

## 5. Before vs After

| | Before | After |
|---|---|---|
| Structure | 1 page, ~12 stacked cards | 6 tabs, 1 concern each |
| First-paint cognitive load | everything at once | one tab (~2–3 cards) |
| Registry/technical data | front-and-center | behind Developer Mode |
| Themes | pill bar | preview gallery |
| Health | `92%` | score + label + 4 real checks + last-checked |
| AI keys | mixed in | dedicated tab, per-provider cards |
| Reusable components | 0 extracted | Tabs + 2 settings components |

## 6. UX / quality metrics

- **Hierarchy:** 1 primary action surface per tab; max content density per view cut from ~12 cards to ≤4.
- **A11y:** tablist keyboard nav, `aria-selected/controls`, `role="switch"` dev toggle, focus-visible rings, `prefers-reduced-motion` honored on all motion.
- **Performance:** all animation is `transform`/`opacity` (GPU); data via cached React Query.
- **Consistency:** 100% design-token driven (cyan/navy/glass), shared primitives.
- **Validation:** `tsc --noEmit` clean; `/settings` compiles and renders (HTTP 200).

## 7. Future opportunities (need backend first)

To honestly deliver the dropped tabs, these endpoints would be required:
- **Workspace:** `GET /workspace` (plan, members, limits, storage), `GET /workspace/invites`, `GET /workspace/usage`.
- **Security:** `GET /auth/sessions` + revoke, `…/mfa` enroll/verify, `…/audit-log`, personal access tokens CRUD.
- **AI usage:** per-provider `GET /user-ai-keys/usage` (latency p50/p95, tokens, cost) + a lightweight `POST /user-ai-keys/test`.
- **Runtime ops:** `GET /runtime/workers|queue|jobs` (or a metrics passthrough).

Once any of these exist, the tab can be added with the same card system — no fake data.
