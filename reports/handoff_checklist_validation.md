# Handoff Checklist Validation

Date: 2026-05-28

## Required Checklist

- `blueprint_exists`
- `prompt_master_exists`
- `gatekeeper_approved`
- `architectural_graph_exists`
- `endpoints_selected`
- `modules_selected`
- `infrastructure_recommendations_available`
- `engineering_readiness_available`
- `no_critical_blockers`
- `project_status_ready_for_generation`

## Readiness Rules

- Gatekeeper `blocked` or project `generation_blocked` returns `handoff_readiness = blocked`.
- Missing required snapshots returns `handoff_readiness = incomplete`.
- Approved or approved-with-warnings projects with all required checks passing return `handoff_readiness = ready`.
- Generation remains disabled in every frontend state.

## Trace Safety

Trace includes operation names, included artifact ids, project id, generated timestamp, and omitted sensitive field classes.

Trace does not include raw secret-bearing fields and reports `contains_secrets: false`.
