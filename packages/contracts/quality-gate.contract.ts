// Shared contract for the Meta-Factory Quality Gate.
// Mirrors apps/api/app/schemas/quality_gate.py.

export type QualityIssueSeverity = 'BLOCKER' | 'WARNING' | 'INFO';
export type QualityIssueFixStatus = 'pending' | 'applied' | 'failed' | 'skipped';

export interface QualityIssue {
  id: string;
  title: string;
  severity: QualityIssueSeverity;
  category: string;
  file?: string | null;
  root_cause: string;
  suggested_fix: string;
  auto_fixable: boolean;
  fix_status: QualityIssueFixStatus;
}

export interface QualityGateReport {
  project_id: string;
  passed: boolean; // no BLOCKER issues
  can_release: boolean; // passed OR a conscious release override is on the project
  release_override: boolean;
  score: number;
  built: boolean; // true when the real build (npm/pip/mvn) was run
  blocker_count: number;
  warning_count: number;
  info_count: number;
  issues: QualityIssue[];
  generated_at: string;
}
