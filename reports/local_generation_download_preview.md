# Local Generation Download + Preview

Status: implemented

Scope delivered:
- Backend endpoints for generated file listing, safe text preview, secure ZIP preparation, and ZIP download.
- Project detail UI with generated file explorer, text-only preview, secure download section, and LDCN presence states.
- Public frontend hooks: `use-generated-files.ts`, `use-generated-file-content.ts`, and `use-prepare-download.ts`.
- No AI calls, no real agents, no shell execution in generated project handling, no install, no deploy.

Endpoints:
- `GET /api/generation/{project_id}/files`
- `GET /api/generation/{project_id}/file-content?path=...`
- `POST /api/generation/{project_id}/prepare-download`
- `GET /api/generation/{project_id}/download`

Persistence:
- Successful local generation now marks the project as `generated`, sets readiness to `generated`, and stores `generated_project_path`.

Empty state:
- Projects without a persisted generated path return a clear backend error and render `Project not generated yet` in Project Detail.
