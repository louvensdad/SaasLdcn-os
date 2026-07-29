# Business Rules Gatekeeper

## New Critical Checks

- `requirements_completeness_check`
- `business_rules_check`
- `entity_model_check`
- `delivery_target_check`

All four checks fail critically when their required input is absent. The Gatekeeper decision becomes `blocked`, the persisted project becomes `generation_blocked`, and generation handoff cannot become ready.

The handoff checklist now includes `project_requirements_complete`. Local and backend generation require a ready handoff, so the requirements check blocks both execution paths.

Coverage includes incomplete Blueprint requirements and each new Gatekeeper check.
