// Shared contract for the Meta-Factory Auto-Repair engine.
// Mirrors apps/api/app/schemas/auto_repair.py.

import type { QualityGateReport } from './quality-gate.contract';

export type RepairActionStatus = 'applied' | 'failed' | 'skipped';

export interface RepairAction {
  issue_id: string;
  title: string;
  status: RepairActionStatus;
  files_written: string[];
  files_deleted: string[];
  detail: string;
}

export interface RepairPlan {
  project_id: string;
  actions: string[]; // auto-fixable issue ids
}

export interface RepairResult {
  project_id: string;
  actions: RepairAction[];
  applied_count: number;
  failed_count: number;
  skipped_count: number;
  diff_summary: string[]; // paths only — never file contents/secrets
}

export interface RevalidationResult {
  project_id: string;
  report: QualityGateReport;
  fixed_ids: string[];
  remaining_ids: string[];
  score_delta: number;
}
