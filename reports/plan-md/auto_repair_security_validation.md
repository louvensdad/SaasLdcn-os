# Auto-Repair — Security Validation

The Auto-Repair engine is constrained so it can never be a foothold for damage.

## Guarantees
- **No shell, no LLM.** `AutoRepairEngine` only writes/deletes files via `ProjectWriter`; it
  never executes a command or calls a model.
- **Path containment.** Every write goes through `ProjectWriter._safe_target` and every delete
  through `ProjectWriter.delete`, both of which reject absolute paths, `..` traversal, and any
  target that resolves outside the project root. The generation marker cannot be deleted.
- **Stays in the generated project.** The project root must live under the workspace
  `generated-projects` tree; the engine never touches `apps/`, `packages/`, or the repo.
- **Never writes secrets.** Generated `.env.example` ships only safe placeholders; the engine's
  secret remediation is to **delete** a real `.env`/secret file, never to rewrite code with a value.
- **Never silently ignores BLOCKERs.** Issues it cannot safely fix stay in the report as
  BLOCKERS; they are not marked resolved.
- **Diff-logged.** `RepairResult.diff_summary` lists changed paths only (no contents/secrets).
- **Secret scan before export** (`GeneratedProjectQualityEngine`) still runs; secrets block
  Git export regardless of repair.

## Tests
- `test_repair_refuses_path_traversal`: `ProjectWriter.delete(pid, "../escape.txt")` and an
  absolute path both raise `ProjectWriteError`.
- `test_repair_removes_real_env_file`: a real `.env` is detected (BLOCKER) and safely deleted.
- Existing `generated_project_quality_engine` traversal/symlink/secret findings remain in force.

## Audit
All repair actions are auditable: `auto_repair_started`, `auto_repair_action_applied`,
`auto_repair_completed` / `auto_repair_failed` (user_id + event code only).
