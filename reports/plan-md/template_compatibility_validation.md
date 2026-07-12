# Template Compatibility Validation

Date: 2026-06-02

## Compatibility Rules

The metadata engine scores local templates against wizard/project selections:

- language match
- framework match
- architecture match
- archetype match
- selected capability overlap
- stable or mature template maturity
- low complexity bonus

Templates are compatible when score is at least 65 and required framework/archetype checks are not missing.

## UI Validation

- Templates page shows `Template compatibility validated`.
- Wizard hides incompatible recommendations by filtering compatibility results before rendering.
- Project Detail shows compatibility presence after local template metadata is available.

## Backend Tests

Added backend coverage for:

- catalog metadata
- template detail
- categories
- compatible selection
- incompatible framework selection
- recommendation ranking

## Safety

Compatibility validation is deterministic and does not execute generated project code.
