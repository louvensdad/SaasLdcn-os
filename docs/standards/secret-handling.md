# Secret Handling Standard

## Rule

Sensitive runtime material must not cross into durable or user-visible artifacts unless explicitly designed as a redacted status object.

## Sensitive material

- OpenAI, Gemini, Anthropic, or other provider API keys.
- GitHub or GitLab access tokens.
- `.env` files and generated credentials.
- Private keys and certificates.
- Raw PDF contract text or sensitive contract clauses.

## Required behavior

- Do not log secrets.
- Do not return secrets to the frontend after submission.
- Do not include secrets in Prompt Master trace.
- Do not include secrets in Gatekeeper trace.
- Do not include secrets in generated files or ZIPs.
- Do not include secrets in Git export payloads.
- Do not log raw PDF contract text.
- Reject path traversal in upload and generated-file access.

## Trace shape

Traces may include ids, status, timestamps, and `redacted_fields`. They must not include raw keys, token fragments, provider request bodies, full contract text, or generated file content.

## V1 Foundation placeholders

User Key Boost, Git Export, and PDF Contract Input endpoints return `501 Not Implemented` until secure storage, scanning, and provider integration are deliberately implemented.
