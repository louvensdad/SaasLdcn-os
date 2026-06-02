# Template Recommendation Validation

Date: 2026-06-02

## Recommendation Source

Recommendations come from `TemplateMetadataEngine.recommendations`, which ranks local registry templates by compatibility score.

## Wizard Integration

The Wizard sends the selected:

- language
- framework
- architecture
- archetype
- capabilities

The UI renders only compatible local templates and displays the compatibility score, complexity, category, and maturity.

## LDCN Presence

Added visible presence states:

- Template compatibility validated
- Recommended template detected
- Template maturity verified

## Frontend Tests

Added Playwright coverage for:

- local marketplace cards and details
- search
- category filtering
- complexity filtering
- offline safe state

## Constraint

No external template marketplace, network download, AI, agents, shell execution feature, or deployment flow was added.
