# Secure ZIP Validation

Status: implemented

Safety rules:
- ZIP source is resolved only from the persisted generated project path.
- The generated project path must exist, be a directory, stay inside the LDCN OS workspace, and contain `.ldcn-generation.json`.
- The LDCN OS workspace root is rejected as a generated project path.
- Absolute external file paths are rejected by file preview path resolution.
- ZIP entries are relative project paths only.
- Secret-like filenames and secret-like key/value content are excluded.
- Download returns `application/zip`.

Validation coverage:
- ZIP preparation works.
- Secret-like files are filtered from the ZIP.
- Repository root files such as `apps/api/app/main.py`, `.git/config`, and templates are not included.
- Path traversal and absolute external paths are blocked.
- Projects that have not run local generation return a clear error.
