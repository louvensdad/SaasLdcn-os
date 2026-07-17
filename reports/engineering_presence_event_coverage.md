# Event coverage

Activity events now support `severity`, `importance`, `evidence_ref`, and `resolved_at`. Sandbox results map to persisted events for success, timeout, resource limit, security block, cancellation, failure, and sandbox failure. Existing Git and Runtime events receive explicit priority classification.

Collectors that do not execute in the current deployment are not represented as successful events.