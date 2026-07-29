# Template Registry Foundation

Date: 2026-06-02

## Scope

Implemented a local template marketplace foundation without AI, external marketplace access, internet downloads, agents, deployment, or package installation.

## Backend

- Added `TemplateRegistryEngine` in `apps/api/app/engines/template_registry_engine.py`.
- Added `TemplateMetadataEngine` in `apps/api/app/engines/template_metadata_engine.py`.
- Added local metadata fields for id, name, description, version, category, supported languages/frameworks/architectures/archetypes, capabilities, complexity, maturity, preview images, tags, and changelog.
- Added endpoints:
  - `GET /api/templates/catalog`
  - `GET /api/templates/{template_id}`
  - `GET /api/templates/{template_id}/compatibility`
  - `GET /api/templates/categories`
  - `GET /api/templates/recommended`

## Frontend

- Rebuilt the Templates page around the local catalog endpoint.
- Added search, category filter, complexity filter, template cards, compatibility signals, maturity signals, capabilities, tags, and changelog preview.
- Added Wizard template recommendations using the current language, framework, architecture, archetype, and capabilities.
- Added Project Detail template metadata for locally generated projects, including version and changelog when a local generation records `template_id`.

## Local-Only Constraint

All data is sourced from local template manifests and deterministic in-repo metadata. No external marketplace integration was added.
