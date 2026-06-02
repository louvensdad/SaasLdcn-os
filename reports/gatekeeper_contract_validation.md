# Gatekeeper Contract Validation

Date: 2026-05-20

## Contract coverage

- `GatekeeperReport`
- `GatekeeperCheck`
- `GatekeeperSeverity`
- `GatekeeperStatus`
- `GatekeeperDecision`
- `GatekeeperTrace`
- `GatekeeperPreviewPayload`

## Contract behavior validated

- Gatekeeper input requires:
  - `blueprint`
  - `prompt_master`
- Gatekeeper output preserves:
  - report id
  - blueprint id
  - prompt master id
  - decision
  - summary
  - blockers
  - warnings
  - mandatory checks
  - safe trace
  - generated at timestamp

## Validation rules

- Gatekeeper never mutates the input blueprint
- Gatekeeper never mutates the input Prompt Master
- Gatekeeper never generates code
- Gatekeeper never calls an LLM
- Critical failures force `decision=blocked`
- Warning-only runs force `decision=approved_with_warnings`
- Fully clean runs force `decision=approved`
- Trace reports `contains_secrets=false`

## Safety rules enforced

- Prompt Master invalid state blocks progression
- Blueprint invalid state blocks progression
- Secret-like material is checked in prompt content and trace
- Generation constraints must remain explicit in the Prompt Master
