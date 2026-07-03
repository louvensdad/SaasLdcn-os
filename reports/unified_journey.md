# Unified Journey — Projetos IA → Meta-Fábrica (one product)

**Goal:** the user never sees the seam between the AI Project Room and the Meta-Factory.
The Meta-Factory is a *step of a project*, reachable only with an approved PromptMaster, and
fed automatically — no copy/paste.

## Two entry points
- **Fluxo 1:** New Project Room → chat → PromptMaster.md → **Aprovar** → **Enviar para
  Meta-Fábrica** → redirect to `/meta-factory?projectId=<roomId>` (spec pre-loaded).
- **Fluxo 2:** **Importar PromptMaster** (.md / texto / JSON) → status `APPROVED` →
  redirect to `/meta-factory?projectId=<roomId>` (spec pre-loaded).

The room **is** the project: `room_id == projectId`. The Meta-Factory loads the spec/
PromptMaster via `GET /project-rooms/{id}` — no manual transfer.

## Menu
- Renamed "Salas de Projeto" → **"Projetos IA"** (`/project-rooms`).
- **Removed** Meta-Fábrica from the sidebar (it's a project step, not a destination).
- **Added "Biblioteca"** → reuses the Templates marketplace (`/templates`); the old
  "Templates" entry was folded into it.

## Project phases (in "Projetos IA")
Colored chips mapped from the room status:
🟡 Em Descoberta (DRAFT/UNDER_REVIEW/PROMPT_READY) · 🟢 Prompt Aprovado (APPROVED) ·
🔵 Em Geração (SENT_TO_GENERATOR) · 🟣 Gerado (GENERATED) · ⚫ Arquivado (ARCHIVED).
Per-row **Arquivar** action.

## Import
`POST /project-rooms/import` — `format: markdown | text | json`.
- **json:** the content IS a `ProjectSpec` (validated; 422 if invalid) → a fresh PromptMaster.md
  is rendered.
- **markdown/text:** the orchestrator derives a `ProjectSpec`, and the **user's document is
  kept verbatim** as the PromptMaster.md.
Both create a room with `status = APPROVED`.

## Hand-off (GenerationJob) & business rule
- "Enviar para Meta-Fábrica" calls `send-to-generator`, which now creates a **GenerationJob**
  (`{ handoff_id, project_id=room_id, workspace_id, prompt_master_version, project_name,
  status: "queued", generated_project_id }`), sets room status `SENT_TO_GENERATOR`, then the
  UI redirects with `?projectId`.
- **Meta-Factory block rule:** the page loads the room and only enables generation when the
  project has an approved PromptMaster (`status ∈ {APPROVED, SENT_TO_GENERATOR, GENERATED}` and
  `prompt_master_md` present). Otherwise it shows a blocked notice.
- **Auto-load, not auto-run:** the spec is pre-filled; the user clicks Generate (no LLM cost
  without consent). On a successful generation the page calls `mark-generated`, moving the
  project to **Gerado** and linking the generated `project_id`.

## Verification
- Backend: `python -m pytest tests/test_project_rooms.py -q` → 16 passed (incl. import md/json/
  invalid, GenerationJob `project_id == room_id`, mark-generated → GENERATED, archive).
- Frontend: `npm run typecheck` clean · `npm run build` ok (`/project-rooms/import` added;
  meta-factory builds with the `projectId` Suspense boundary) · i18n audit: 0 findings in new files.
- Manual smoke: Fluxo 1 and Fluxo 2 both land on the Meta-Factory with the spec loaded; a
  non-approved `projectId` shows the blocked notice.
