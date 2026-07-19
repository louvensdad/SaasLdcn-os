import type { BuildValidationReport } from './generation-validation.contract';

// Mirrors app/schemas/change_request.py exactly -- see that file for the
// vault-literal lifecycle this models (Protocolo de alteracao incremental).
export type ChangeRequestStatus =
  | 'Draft'
  | 'Analyzed'
  | 'Planned'
  | 'Approved'
  | 'Applying'
  | 'Validating'
  | 'Accepted'
  | 'Rejected'
  | 'Rolled Back';

export type ChangeRequestClassification = 'visual_only' | 'blueprint_version' | 'new_blueprint';
export type OperationStatus = 'pending' | 'running' | 'success' | 'failed' | 'rollback';
export type FileDiffKind = 'added' | 'modified' | 'deleted';

export const CONSCIOUS_APPROVAL_PHRASE = 'APROVAR ALTERACAO';

export interface ClassificationResult {
  readonly category: ChangeRequestClassification;
  readonly reason: string;
  readonly blueprint_impact: 'none' | 'version_bump' | 'new_blueprint';
  readonly degraded: boolean;
}

export interface ImpactAnalysis {
  readonly affected_files: readonly string[];
  readonly out_of_scope_risk: readonly string[];
  readonly requires_backend_change: boolean;
  readonly requires_blueprint_update: boolean;
  readonly summary: string;
  readonly degraded: boolean;
}

export interface FileDiff {
  readonly path: string;
  readonly before?: string | null;
  readonly after?: string | null;
  readonly unified_diff: string;
  readonly change_kind: FileDiffKind;
}

export interface ChangeRequestDiff {
  readonly change_request_id: string;
  readonly files: readonly FileDiff[];
}

export interface ChangeRequestApproval {
  readonly status: 'approved';
  readonly approved_by: string;
  readonly approved_at: string;
}

export interface ChangeRequestResult {
  readonly outcome: 'accepted' | 'rejected' | 'rolled_back';
  readonly reason: string;
  readonly recorded_at: string;
}

export interface ChangeRequestHistoryEvent {
  readonly id: string;
  readonly event: string;
  readonly actor: string;
  readonly source: string;
  readonly created_at: string;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export interface ChangeRequestOperationLog {
  readonly id: string;
  readonly timestamp: string;
  readonly method?: string | null;
  readonly endpoint?: string | null;
  readonly http_status?: number | null;
  readonly status: OperationStatus;
  readonly message: string;
  readonly detail?: string | null;
}

export interface ChangeRequestFailureDiagnostic {
  readonly status_current: string;
  readonly status_expected: readonly string[];
  readonly endpoint_called: string;
  readonly http_status: number;
  readonly backend_message: string;
  readonly rejection_reason: string;
  readonly correction: string;
  readonly checks: readonly Record<string, unknown>[];
}

// Minimal shape for RuntimeFunctionalTestReport (app/schemas/runtime_functional_test.py) --
// only what the Change Request preview panel needs to render; not the full contract for
// that engine, which has no frontend surface yet.
export interface ChangeRequestPreviewRoute {
  readonly path: string;
  readonly ok: boolean;
  readonly http_status?: number | null;
  readonly redirected_to?: string | null;
  readonly console_errors: readonly string[];
  readonly network_failures: readonly string[];
  readonly screenshot_path?: string | null;
  readonly detail: string;
}

export interface ChangeRequestPreviewResult {
  readonly project_id: string;
  readonly supported: boolean;
  readonly reason: string;
  readonly backend_started: boolean;
  readonly frontend_started: boolean;
  readonly routes: readonly ChangeRequestPreviewRoute[];
  readonly crash_count: number;
  readonly generated_at: string;
}

export interface ChangeRequest {
  readonly change_request_id: string;
  readonly owner_user_id: string;
  readonly workspace_id?: string | null;
  readonly project_id: string;
  readonly room_id?: string | null;
  readonly feature_id?: string | null;
  readonly task_id?: string | null;
  readonly base_version?: string | null;
  readonly status: ChangeRequestStatus;
  readonly intent: string;
  readonly classification?: ClassificationResult | null;
  readonly scope: readonly string[];
  readonly impact?: ImpactAnalysis | null;
  readonly diff: readonly FileDiff[];
  readonly build_result?: BuildValidationReport | null;
  readonly preview_result?: ChangeRequestPreviewResult | null;
  readonly approval?: ChangeRequestApproval | null;
  readonly result?: ChangeRequestResult | null;
  readonly history: readonly ChangeRequestHistoryEvent[];
  readonly operational_log: readonly ChangeRequestOperationLog[];
  readonly last_failure?: ChangeRequestFailureDiagnostic | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ChangeRequestSummary {
  readonly change_request_id: string;
  readonly project_id: string;
  readonly status: ChangeRequestStatus;
  readonly intent: string;
  readonly created_at: string;
  readonly updated_at: string;
}
