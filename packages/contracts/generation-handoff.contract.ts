import type { GraphSnapshot } from './architectural-graph.contract';
import type { ProjectBlueprint } from './blueprint.contract';
import type { ImpactProfile } from './dependency-graph.contract';
import type { EngineeringReadinessProfile } from './engineering-readiness.contract';
import type { GatekeeperReport } from './gatekeeper.contract';
import type { InfrastructureRecommendation } from './infrastructure.contract';
import type { PromptMasterDocument } from './prompt-master.contract';
import type { ProjectRecord } from './project.contract';
import type { ContractMetadata, ContractValue } from './shared.contract';

export type HandoffReadiness = 'ready' | 'blocked' | 'incomplete';
export type HandoffChecklistStatus = 'passed' | 'failed' | 'warning';
export type HandoffArtifactKind =
  | 'project_record'
  | 'blueprint_snapshot'
  | 'prompt_master_snapshot'
  | 'gatekeeper_snapshot'
  | 'architectural_graph_snapshot'
  | 'infrastructure_recommendations'
  | 'dependency_impact'
  | 'engineering_readiness'
  | 'selected_scope';

export interface HandoffChecklist extends ContractMetadata {
  readonly id: string;
  readonly label: string;
  readonly required: boolean;
  readonly status: HandoffChecklistStatus;
  readonly summary: string;
}

export interface HandoffArtifact extends ContractMetadata {
  readonly id: string;
  readonly kind: HandoffArtifactKind;
  readonly label: string;
  readonly included: boolean;
  readonly source: string;
  readonly summary: string;
  readonly item_count?: number;
}

export interface HandoffBlocker extends ContractMetadata {
  readonly code: string;
  readonly source: string;
  readonly message: string;
  readonly severity: 'critical';
  readonly related_ids: readonly string[];
}

export interface HandoffWarning extends ContractMetadata {
  readonly code: string;
  readonly source: string;
  readonly message: string;
  readonly severity: 'warning' | 'info';
  readonly related_ids: readonly string[];
}

export interface HandoffTrace extends ContractMetadata {
  readonly generated_at: string;
  readonly project_id: string;
  readonly operations: readonly string[];
  readonly included_artifact_ids: readonly string[];
  readonly omitted_sensitive_fields: readonly string[];
  readonly contains_secrets: false;
}

export interface GenerationHandoffPackage extends ContractMetadata {
  readonly handoff_id: string;
  readonly project_id: string;
  readonly project_name: string;
  readonly handoff_readiness: HandoffReadiness;
  readonly project_record: ProjectRecord;
  readonly blueprint_snapshot?: ProjectBlueprint | null;
  readonly prompt_master_snapshot?: PromptMasterDocument | null;
  readonly gatekeeper_snapshot?: GatekeeperReport | null;
  readonly architectural_graph_snapshot?: GraphSnapshot | null;
  readonly infrastructure_recommendations?: InfrastructureRecommendation | null;
  readonly dependency_impact?: ImpactProfile | null;
  readonly engineering_readiness?: EngineeringReadinessProfile | null;
  readonly selected: {
    readonly endpoints: readonly string[];
    readonly modules: readonly string[];
    readonly capabilities: readonly string[];
  };
  readonly checklist: readonly HandoffChecklist[];
  readonly artifacts: readonly HandoffArtifact[];
  readonly blockers: readonly HandoffBlocker[];
  readonly warnings: readonly HandoffWarning[];
  readonly trace: HandoffTrace;
  readonly generation_disabled: true;
  readonly metadata: Readonly<Record<string, ContractValue>>;
}
