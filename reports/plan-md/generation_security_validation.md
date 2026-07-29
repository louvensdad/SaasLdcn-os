# Generation Security Validation

Status: implemented

Validated controls:
- Path traversal blocked.
- Absolute paths outside workspace blocked.
- Workspace root output blocked.
- Existing target directories blocked.
- Protected directories blocked.
- Generation disabled when handoff is blocked or incomplete.
- ZIP preparation uses existing generated project safety filters.
- Secret-like files are filtered from ZIP and preview.

Forbidden operations:
- No shell execution.
- No package install.
- No docker build.
- No git clone.
- No internet access.
- No remote execution.
