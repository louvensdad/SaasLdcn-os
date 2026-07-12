# Documentation Generation — Security

Generated documentation is held to the same security bar as hand-written docs.

## Guarantees
- **No secrets persisted.** Every generated document is run through
  `DocumentationEngine.sanitize()` before it is previewed *and* again before it is saved. The
  sanitizer redacts secret-like assignments (`secret/token/password/api_key/private_key/
  credential/access_token = <12+ chars>`) to `<redacted>`, skipping obvious placeholders
  (`change-me`, `placeholder`, `example`, `your-`, …). The redaction heuristic is the *same*
  one the validator uses, so a credential can never slip past generation and then fail the
  library validator.
- **Never copies a real `.env`.** The writer builds docs from structured project facts and a
  filtered file listing, not from raw secret files; `.env`-style files are already excluded by
  the generated-project file service.
- **Never invents credentials.** Examples use placeholders only (enforced by the system prompt
  and by sanitization of the output).
- **Validated after generation.** Each preview carries `safe` + `issues`; `save()` re-sanitizes
  and re-scans, and reports `blocked` defense-in-depth if anything secret-shaped survived.
- **Export still gated.** The existing library export refuses to write `/docs` when any document
  is `unsafe` or a required document is missing.

## Tests
`test_generate_redacts_secrets_from_llm_output`, `test_save_sanitizes_secrets_before_writing`
(plus the export-blocked tests in `test_documentation.py`).
