# Template Resolution Validation

Date: 2026-05-28

## Template Manifests

Each template includes:

- `manifest.json`
- file templates under `files/`
- metadata
- variables schema
- supported capabilities

## Resolution Rules

- `landing_page` resolves to `landing-page`.
- `portfolio` resolves to `portfolio`.
- `documentation_site` resolves to `docs-site`.
- static-site stack variants can resolve to `static-site`.
- unsupported archetypes return a blocked generation result.

## Rendering

Rendering uses deterministic `{{variable.path}}` replacement only.

No AI, prompt expansion, reasoning, network fetch, dependency installation, or shell execution is performed.
