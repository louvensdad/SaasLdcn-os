// Delivery Decision Center: generation finishing and how the user wants the
// output delivered are independent decisions. Mirrors
// apps/api/app/schemas/delivery.py -- scoped to what's real today (ZIP export,
// Git export). Cloud deploy / domain / enterprise mode are deliberately not
// represented here since nothing implements them yet.

export type DeliveryMode = 'zip_only' | 'git_export' | 'zip_and_git' | 'ldcn_only';

export interface DeliveryModeOption {
  readonly mode: DeliveryMode;
  readonly label: string;
  readonly recommended: boolean;
  readonly reason: string;
}

export interface DeliveryProfile {
  readonly project_id: string;
  readonly delivery_mode: DeliveryMode;
  readonly chosen_by: string;
  readonly chosen_at: string;
}

export interface DeliveryDecision {
  readonly project_id: string;
  readonly kernel_phase: string;
  readonly blocked: boolean;
  readonly block_reason: string;
  readonly options: readonly DeliveryModeOption[];
  readonly current_profile: DeliveryProfile | null;
}
