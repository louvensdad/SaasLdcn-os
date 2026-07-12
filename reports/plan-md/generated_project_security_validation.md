# Generated Project Security Validation

## Security Checks

Generated Project Quality Gate V1 validates:

- Generated project root stays inside the LDCN OS workspace
- `.ldcn-generation.json` exists before validation
- Path traversal is rejected
- Symlink escape is rejected
- Real `.env` files are blocked
- Secret-like files are blocked
- Hardcoded API keys, tokens, passwords, credentials, and private keys are detected
- Prepared ZIP entries cannot include traversal paths
- Prepared ZIP entries cannot include LDCN OS workspace root folders

## Allowed Placeholders

`.env.example` is allowed only as a placeholder file. Known local placeholder values such as `change-me-local-only` and deterministic preview tokens do not count as real secrets.

## Dangerous Operations

The validation engine never runs dependency installation, build commands, Docker, Git operations, network calls, or generated project code.

