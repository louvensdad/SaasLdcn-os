# Security Secret Handling

## Core rule

Secrets and sensitive contract content are runtime-only material. They must not enter frontend hydration after save, logs, generated files, ZIPs, Git exports, Prompt Master trace, Gatekeeper trace, or analytics.

## Secret classes

- User AI API keys for OpenAI, Gemini, and Anthropic.
- GitHub and GitLab OAuth tokens or temporary access tokens.
- Generated project secret-like files and values.
- Sensitive PDF contract content.

## Required blockers

Security Gate must block or filter:

- API keys in logs.
- API keys in ZIPs.
- API keys in generated files.
- Git tokens in traces.
- Contract sensitive content in logs.
- PDF upload path traversal.
- Secret-like generated files before Git export.

## Detection baseline

Reuse and expand the existing generated project safety patterns:

- secret-like file names: `.env`, `secret`, `token`, `password`, `api_key`, `private_key`, credentials, PEM/P12/id_rsa material
- secret-like values: assignments for secret, token, password, API key, private key, credential

For future model keys, add provider-specific detectors without logging the matched value.

## Trace policy

Prompt Master, Gatekeeper, generation handoff, PDF analysis, and Git export traces must include:

- `contains_secrets: false` when safe
- explicit `redacted_fields`
- ids and statuses only

They must not include raw API keys, Git tokens, full contract text, provider request bodies, or generated file content.

## Implementation phases

- Phase A: contracts and documentation.
- Phase B: User Key Boost session foundation.
- Phase C: PDF upload and embedded text extraction foundation.
- Phase D: Git Export foundation.
- Phase E: Prompt Master and Gatekeeper integration.
