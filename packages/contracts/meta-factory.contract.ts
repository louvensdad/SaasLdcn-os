// Shared contract for Meta-Factory release actions (force-release).
// Mirrors apps/api/app/schemas/auto_repair.py (ForceRelease*) and the
// /meta-factory/:projectId/force-release endpoint.

export { type QualityGateReport, type QualityIssue, type QualityIssueSeverity } from './quality-gate.contract';
export { type RepairResult, type RevalidationResult } from './auto-repair.contract';

// The exact phrase the user must type to consciously release a project that still
// has unresolved problems. Locale-independent on purpose (explicit + auditable).
export const CONSCIOUS_RELEASE_PHRASE = 'LIBERAR COM RISCO';

export interface ForceReleaseRequest {
  confirmation: string; // must equal CONSCIOUS_RELEASE_PHRASE
}

export interface ForceReleaseAudit {
  project_id: string;
  released_by: string;
  blocker_count: number;
  warning_count: number;
  confirmed_at: string;
}
