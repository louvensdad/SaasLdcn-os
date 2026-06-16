import type { ProjectBlueprint } from './blueprint.contract';
import type { PromptMasterDocument } from './prompt-master.contract';
import type { GeneratedProjectLocaleProfile } from './locale.contract';
import type { ContractId, ContractMetadata } from './shared.contract';

export type GatekeeperSeverity = 'info' | 'warning' | 'critical';
export type GatekeeperStatus = 'passed' | 'warning' | 'failed';
export type GatekeeperDecision = 'approved' | 'approved_with_warnings' | 'blocked';

export type GatekeeperCheckId =
  | 'technology_graph_check'
  | 'requirements_completeness_check'
  | 'business_rules_check'
  | 'entity_model_check'
  | 'delivery_target_check'
  | 'architecture_compatibility_check'
  | 'business_module_check'
  | 'endpoint_plan_check'
  | 'capability_dependency_check'
  | 'engineering_readiness_check'
  | 'security_baseline_check'
  | 'testing_baseline_check'
  | 'documentation_baseline_check'
  | 'generation_constraint_check'
  | 'locale_i18n_check'
  | 'secret_exposure_check'
  | 'trace_safety_check';

export interface GatekeeperCheck {
  readonly id: GatekeeperCheckId;
  readonly title: string;
  readonly status: GatekeeperStatus;
  readonly severity: GatekeeperSeverity;
  readonly summary: string;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly related_item_ids: readonly string[];
}

export interface GatekeeperTrace {
  readonly blueprint_id: ProjectBlueprint['blueprint_id'] | string;
  readonly prompt_master_id: PromptMasterDocument['prompt_master_id'] | string;
  readonly check_ids: readonly GatekeeperCheckId[];
  readonly redacted_fields: readonly string[];
  readonly contains_secrets: boolean;
}

export interface GatekeeperReport extends ContractMetadata {
  readonly gatekeeper_report_id: ContractId | string;
  readonly blueprint_id: ProjectBlueprint['blueprint_id'] | string;
  readonly prompt_master_id: PromptMasterDocument['prompt_master_id'] | string;
  readonly decision: GatekeeperDecision;
  readonly locale_profile: GeneratedProjectLocaleProfile;
  readonly summary: string;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly checks: readonly GatekeeperCheck[];
  readonly trace: GatekeeperTrace;
  readonly generated_at: string;
}

export interface GatekeeperPreviewPayload {
  readonly blueprint: ProjectBlueprint;
  readonly prompt_master: PromptMasterDocument;
}
