# Requirements-First Generation

## Implemented

- Added mandatory `project_requirements` to Blueprint preview and persisted Blueprint snapshots.
- Required project goal, business context, target users, business rules, entities, workflows, constraints, delivery target, modules, endpoints, locale, stack, and generation mode.
- Removed the fallback project name that allowed generic blueprints.
- Added a mandatory first Wizard step covering Project Intent, Business Rules, Data Model Intent, and Delivery Method.
- Disabled Wizard progression and project generation actions when requirements are incomplete.
- Added the blocking message: `Complete os requisitos do projeto antes de gerar.`
- Prompt Master now preserves user-defined intent instead of inferring a generic product from the archetype.
- Backend and local generated READMEs now include goal, context, users, rules, workflows, entities, constraints, and delivery target.

## Validation

- Incomplete previews remain available for diagnostics but return `validation.valid = false`.
- Prompt Master, Gatekeeper, generation handoff, local generation, and backend generation cannot approve incomplete requirements.
- Backend suite: 162 passed.
