# Engineering Readiness Foundation

## Scope

The foundation adds deterministic engineering planning endpoints for a selected language, framework, architecture, capability set, and infrastructure set.

## Implemented surfaces

- `POST /api/engineering/readiness` returns the aggregated engineering readiness profile.
- `POST /api/engineering/team-profile` returns roles, seniority, skills, and team size.
- `POST /api/engineering/delivery-estimate` returns deterministic effort, complexity, and delivery phases.
- `POST /api/engineering/operational-burden` returns operational burden bars and signals.
- Wizard and persisted project detail use the same frontend readiness panel.
- Gatekeeper now consumes production, operational, and team readiness signals.

## Constraints

The engine is rules based. It does not call AI, generation pipelines, or real agents.
