# Generated Projects

status: active

purpose: Local output area for deterministic generated projects.

layout:
- `active/`: recent valid generated projects kept for inspection.
- `archived/`: older or test-generated project snapshots.
- `temp/`: temporary generated directories and conflict-test placeholders.

runtime note: New local generation output paths should target `generated-projects/active/<project-id>` unless a user explicitly chooses another safe workspace path.

