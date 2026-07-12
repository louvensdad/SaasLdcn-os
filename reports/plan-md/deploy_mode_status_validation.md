# Deploy Mode Status Validation

## Goal

Make Status do Sistema answer the production question quickly: is the system ready to deploy?

## Deploy Mode Surface

When Deploy Mode is active, the page shows only:

- Runtime
- API
- Build
- DB
- Health
- Last validation
- Blockers

## Hidden In Deploy Mode

- Active module list
- Active engine list
- Active template list
- Active skill list
- Registry internals
- Technical inventory cards

## Blocker Semantics

Blockers are derived from core and registry status signals with `blocked` status. Healthy or warning signals do not create critical blockers. When none are present, the panel displays `No critical blockers` / localized equivalent.

## Validation

Covered by Playwright tests:

- Deploy Mode hides full active system lists.
- Deploy Mode keeps the blockers panel visible.