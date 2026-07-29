# Secret Handling Standard

Canonical doc: `docs/standards/secret-handling.md`

## Summary

V1 Foundation treats user AI keys, Git tokens, generated credentials, private keys, and sensitive PDF contract text as sensitive runtime material.

## Required protections

- Never log secrets.
- Never return saved key material to the frontend.
- Never write secrets into Prompt Master or Gatekeeper traces.
- Never include secrets in generated files, ZIPs, or Git export payloads.
- Reject path traversal for uploads and generated-file access.
- Keep secure extensions inactive until storage, scanning, and provider integrations are explicitly implemented.
