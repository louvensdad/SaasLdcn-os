# Skill Execution V1

Status: implemented

Engine:
- `apps/api/app/engines/skill_execution_engine.py`

Endpoint:
- `POST /api/skills/execute`

Executable deterministic skills:
- `review_blueprint`
- `inspect_architecture`
- `analyze_readiness`
- `inspect_graph`
- `prepare_handoff`
- `generate_local_project`
- `prepare_download`

Safety:
- No AI.
- No LLM.
- No agents.
- No shell execution.
- No external access.
