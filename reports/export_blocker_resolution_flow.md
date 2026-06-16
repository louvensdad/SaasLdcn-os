# Export Blocker Resolution Flow

Every export blocker uses a structured contract:

- `problem`: what failed.
- `reason`: why export cannot continue.
- `action_label`: corrective action.
- `action_href`: in-platform destination.

Implemented diagnostics include provider connection missing, repository permission missing, Quality Gate failed, Generation Handoff incomplete, generated project unavailable, and provider export failure.

The generic `Provider transport not enabled` blocker was removed.
