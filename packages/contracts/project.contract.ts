import type { BlueprintGenerationMode, ProjectBlueprint, TechnologyGraph } from './blueprint.contract';
import type { GraphSnapshot } from './architectural-graph.contract';
import type { GatekeeperDecision, GatekeeperReport } from './gatekeeper.contract';
import type { LocaleCode } from './locale.contract';
import type { PromptMasterDocument } from './prompt-master.contract';
import type { ContractId, ContractMetadata } from './shared.contract';

export type ProjectStatus =
  | 'draft'
  | 'blueprint_ready'
  | 'gatekeeper_approved'
  | 'ready_for_generation'
  | 'generation_blocked'
  | 'generated'
  | 'failed';

export type ProjectReadinessStatus =
  | 'not_ready'
  | 'blueprint_ready'
  | 'ready_with_warnings'
  | 'ready'
  | 'blocked'
  | 'generated'
  | 'failed';

export interface ProjectRecord extends ContractMetadata {
  readonly project_id: ContractId | string;
  readonly project_name: string;
  readonly status: ProjectStatus;
  readonly locale: LocaleCode;
  readonly generation_mode: BlueprintGenerationMode;
  readonly technology_graph: TechnologyGraph;
  readonly architecture_id: string;
  readonly archetype_id: string;
  readonly selected_capabilities: readonly string[];
  readonly selected_business_modules: readonly string[];
  readonly selected_endpoints: readonly string[];
  readonly blueprint_snapshot: ProjectBlueprint;
  readonly architectural_graph_snapshot?: GraphSnapshot | null;
  readonly prompt_master_snapshot: PromptMasterDocument;
  readonly gatekeeper_snapshot: GatekeeperReport;
  readonly readiness_status: ProjectReadinessStatus;
  readonly created_at: string;
  readonly updated_at: string;
  readonly generated_project_path?: string | null;
}

export interface SaveProjectFromWizardPayload {
  readonly blueprint: ProjectBlueprint;
  readonly prompt_master: PromptMasterDocument;
  readonly gatekeeper: GatekeeperReport;
}

export interface UpdateProjectPayload {
  readonly project_name?: string;
  readonly status?: ProjectStatus;
  readonly readiness_status?: ProjectReadinessStatus;
  readonly generated_project_path?: string | null;
}

export interface ProjectStatusTransition {
  readonly from: ProjectStatus;
  readonly to: ProjectStatus;
  readonly gatekeeper_decision?: GatekeeperDecision;
}
