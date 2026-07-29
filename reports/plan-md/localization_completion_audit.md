# Localization Completion Audit

Date: 2026-06-06

## Result

**BLOCKED - repository-wide localization coverage is not 100%.**

The four interface dictionaries have complete key parity, but the production UI still contains hardcoded visible copy. The sprint cannot be approved against the stated localization criterion.

## Verified

- Dictionaries: `en-US`, `pt-BR`, `es-ES`, and `fr-FR`
- Keys per dictionary: **111**
- Missing keys versus `en-US`: **0**
- Extra keys versus `en-US`: **0**
- Direct literal `placeholder`, `title`, `aria-label`, and `alt` attributes found by the audit scan: **0**
- Existing localization Playwright coverage: green

## Hardcoded UI Audit

Repository-wide scan across `apps/web/app/**/*.tsx` and `apps/web/components/**/*.tsx` found **290 direct JSX text occurrences**. This is a conservative lower bound because it does not include every string held in arrays, object literals, conditional expressions, or component props.

Highest concentrations:

| Surface | Direct JSX text occurrences |
| --- | ---: |
| Wizard page | 79 |
| Project detail page | 67 |
| Framework specialist panel | 16 |
| Dependency graph panel | 15 |
| Templates page | 10 |
| Skills page | 9 |
| Infrastructure recommendations panel | 8 |
| Dashboard | 7 |
| Architecture page | 6 |
| LDCN presence rail | 5 |

The remaining occurrences are distributed across LDCN surfaces, empty/loading/error states, system-design surfaces, overlays, graph details, and supporting UI components.

## Required Completion Work

1. Move all visible page, wizard, project-detail, LDCN, empty-state, error-state, badge, tooltip, and panel copy to translation keys.
2. Add the new keys to all four dictionaries with locale-specific values.
3. Add a static localization gate that fails CI when visible JSX literals or untranslated UI attributes are introduced.
4. Expand Playwright localization coverage beyond Settings, shell navigation, and selected Wizard labels.

## Approval

Localization catalog parity: **PASS**

Localization UI coverage: **FAIL**

No hardcoded text: **FAIL**
