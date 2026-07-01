// Shared contract for the phased modernization plan + approval.
// Mirrors apps/api/app/schemas/modernize.py.

export type ApprovalMode = 'critical_only' | 'full' | 'custom';

export interface FixAction {
  id: string; // auto-repair issue id when auto_fixable
  title: string;
  phase_id: string;
  auto_fixable: boolean;
  requires_extra_confirmation: boolean;
}

export interface ModernizationPhase {
  id: string; // critical | security | architecture | tests | devops
  title: string;
  actions: FixAction[];
}

export interface ModernizationPlan {
  project_id: string;
  phases: ModernizationPhase[];
}

export interface ApprovePlanRequest {
  mode: ApprovalMode;
  phase_ids?: string[]; // used when mode === 'custom'
}

export interface FixApproval {
  project_id: string;
  approved_phase_ids: string[];
}
