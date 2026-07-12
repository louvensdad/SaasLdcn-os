# Project Docs Export

`POST /api/projects/{project_id}/documentation/export`

Organizes a generated project's validated documentation into the standard layout — writing
back to the project's own files, never to a separate store.

## Behavior
1. Re-runs analysis.
2. **Blocks** (no writes) when:
   - any document is `unsafe` (exposed secret), or
   - a required document is missing.
   Returns `{ exported: false, blocked: true, reason }`.
3. On success:
   - creates `<project>/docs/`,
   - **moves** non-README catalog docs into `/docs` (README stays at the root),
   - leaves docs already under `/docs` in place (idempotent, no duplication),
   - writes `docs/INDEX.md` (document index + score + per-document status),
   - returns `{ exported: true, docs_dir, exported_paths, score }`.

## Resulting structure
```
project-root/
├── README.md
└── docs/
    ├── INDEX.md
    ├── ARCHITECTURE.md
    ├── API.md
    ├── DATABASE.md
    ├── SECURITY.md
    ├── TESTING.md
    └── DEPLOYMENT.md
```

## Safety
All writes go through path-containment checks; nothing is written outside the project root,
which must stay inside the LDCN OS workspace and carry `.ldcn-generation.json`.

## Tests
`test_export_writes_docs_dir_and_moves_files`, `test_export_blocked_when_documentation_unsafe`,
`test_export_blocked_when_required_doc_missing`.
