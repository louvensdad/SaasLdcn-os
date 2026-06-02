# Filesystem Generation Validation

Date: 2026-05-28

## Safety Rules

- `output_path` is required.
- Path traversal via `..` is rejected.
- Output paths must resolve inside the LDCN OS workspace.
- Existing directories are rejected with `409`.
- Template file paths cannot be absolute or traverse outside output root.
- Logs and traces are safe and do not include secrets.

## Generated Snapshot

Successful generation writes:

- rendered template files
- `.ldcn-generation.json`
- file map with relative paths, sizes, checksums, and directories
- artifact list with deterministic checksums

The backend tests verified a real landing page output containing `README.md`, `package.json`, `app/page.tsx`, and `.ldcn-generation.json`.
