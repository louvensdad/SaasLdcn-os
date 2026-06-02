# V1 Foundation Release Notes

## Implemented Modules

- Project Registry
- Registry and compatibility foundation
- Blueprint preview
- Prompt Master preview
- Gatekeeper preview
- Generation handoff preview
- Local generation V0 and safe ZIP preparation
- Template marketplace foundation
- Skill registry foundation
- Engineering readiness
- Dependency graph
- Architectural graph
- System design visualization
- Roadmap and system status

## Main Backend Routes

- `GET /api/health`
- `GET /api/stacks`
- `GET /api/registry/*`
- `POST /api/blueprints/preview`
- `POST /api/prompt-master/preview`
- `POST /api/gatekeeper/preview`
- `POST /api/generation/handoff-preview`
- `POST /api/generation/local-run`
- `GET /api/generation/{project_id}/files`
- `GET /api/generation/{project_id}/file-content`
- `POST /api/generation/{project_id}/prepare-download`
- `GET /api/generation/{project_id}/download`
- `GET /api/projects`
- `POST /api/projects/save-from-wizard`
- `GET /api/roadmap`
- `GET /api/system-status`

## Frontend Pages

- `/dashboard`
- `/wizard`
- `/projects`
- `/projects/[projectId]`
- `/templates`
- `/skills`
- `/architecture`
- `/documentation`
- `/roadmap`
- `/system-status`
- `/settings`

## Active Engines

- `architectural_graph_engine`
- `blueprint_engine`
- `dependency_graph_engine`
- `engineering_readiness_engine`
- `gatekeeper_engine`
- `generation_handoff_engine`
- `local_generation_engine`
- `prompt_master_engine`
- `roadmap_engine`
- `skill_registry_engine`
- `system_design_visualization_engine`
- `system_status_engine`
- `template_metadata_engine`
- `template_registry_engine`

## Planned Secure Extensions

- User Key Boost
- Git Export
- PDF Contract Input

These extensions are visible in roadmap/system-status and have placeholder routes only.

## Not Active Yet

- Real AI/model provider calls.
- User API key storage or validation.
- GitHub/GitLab repository export.
- PDF upload processing, embedded text extraction, OCR, or analysis.
- Production auth.
- Agent runtime.
- Deployment automation.
