import type { ContractId, ContractMetadata } from './shared.contract';

export type DependencyNodeType =
  | 'language'
  | 'runtime'
  | 'framework'
  | 'architecture'
  | 'capability'
  | 'business_module'
  | 'endpoint_group'
  | 'infrastructure'
  | 'deployment'
  | 'observability'
  | 'security'
  | 'ai'
  | 'data';

export type DependencyEdgeType =
  | 'requires'
  | 'recommends'
  | 'conflicts_with'
  | 'increases_complexity'
  | 'reduces_complexity'
  | 'enables'
  | 'blocks'
  | 'scales_with'
  | 'optional_with';

export type DependencyImpactBand = 'low' | 'medium' | 'high' | 'enterprise' | 'hyperscale';
export type DependencyRiskSeverity = 'info' | 'warning' | 'critical';
export type MutationCategory =
  | 'architecture'
  | 'deployment'
  | 'infrastructure'
  | 'observability'
  | 'security'
  | 'scalability';

export interface DependencyNode extends ContractMetadata {
  readonly id: string;
  readonly type: DependencyNodeType;
  readonly category: string;
  readonly label: string;
  readonly description: string;
  readonly severity_weight: number;
  readonly complexity_weight: number;
}

export interface DependencyEdge extends ContractMetadata {
  readonly id: string;
  readonly source_id: string;
  readonly target_id: string;
  readonly type: DependencyEdgeType;
  readonly label: string;
  readonly description: string;
  readonly weight: number;
}

export interface DependencyRule extends ContractMetadata {
  readonly id: string;
  readonly label: string;
  readonly trigger_node_ids: readonly string[];
  readonly required_node_ids: readonly string[];
  readonly recommended_node_ids: readonly string[];
  readonly optional_node_ids: readonly string[];
  readonly blocked_node_ids: readonly string[];
  readonly conflicting_node_ids: readonly string[];
  readonly edge_type: DependencyEdgeType;
  readonly rationale: string;
}

export interface ArchitectureMutation extends ContractMetadata {
  readonly id: string;
  readonly trigger_node_id: string;
  readonly category: MutationCategory;
  readonly severity: DependencyRiskSeverity;
  readonly source_value: string;
  readonly mutated_value: string;
  readonly rationale: string;
  readonly related_node_ids: readonly string[];
  readonly required_review: boolean;
}

export interface DependencyPropagation extends ContractMetadata {
  readonly activated_node_ids: readonly string[];
  readonly required_node_ids: readonly string[];
  readonly recommended_node_ids: readonly string[];
  readonly optional_node_ids: readonly string[];
  readonly blocked_node_ids: readonly string[];
  readonly conflicting_node_ids: readonly string[];
  readonly warnings: readonly string[];
  readonly rationale: readonly string[];
  readonly mutations: readonly ArchitectureMutation[];
}

export interface ImpactProfile extends ContractMetadata {
  readonly score: number;
  readonly infra_complexity: DependencyImpactBand;
  readonly deployment_complexity: DependencyImpactBand;
  readonly operational_burden: DependencyImpactBand;
  readonly scaling_complexity: DependencyImpactBand;
  readonly maintenance_cost: DependencyImpactBand;
  readonly security_surface: DependencyImpactBand;
  readonly learning_curve: DependencyImpactBand;
  readonly team_maturity_required: DependencyImpactBand;
  readonly rationale: readonly string[];
}

export interface ReadinessProfile extends ContractMetadata {
  readonly score: number;
  readonly mvp_readiness: number;
  readonly production_readiness: number;
  readonly enterprise_readiness: number;
  readonly scalability_readiness: number;
  readonly observability_readiness: number;
  readonly security_readiness: number;
  readonly missing_requirements: readonly string[];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly suggestions: readonly string[];
}

export interface RiskIssue extends ContractMetadata {
  readonly id: string;
  readonly title: string;
  readonly severity: DependencyRiskSeverity;
  readonly summary: string;
  readonly related_node_ids: readonly string[];
}

export interface RiskProfile extends ContractMetadata {
  readonly score: number;
  readonly risk_level: DependencyImpactBand;
  readonly issues: readonly RiskIssue[];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly rationale: readonly string[];
}

export interface DependencyGraphSnapshot extends ContractMetadata {
  readonly graph_id: ContractId | string;
  readonly language_id: string;
  readonly runtime_id: string;
  readonly framework_id: string;
  readonly architecture_id: string;
  readonly architecture_level: string;
  readonly archetype_id?: string;
  readonly capability_ids: readonly string[];
  readonly infrastructure_ids: readonly string[];
  readonly nodes: readonly DependencyNode[];
  readonly edges: readonly DependencyEdge[];
  readonly rules: readonly DependencyRule[];
  readonly propagation: DependencyPropagation;
  readonly impact_profile: ImpactProfile;
  readonly readiness_profile: ReadinessProfile;
  readonly risk_profile: RiskProfile;
  readonly mutations: readonly ArchitectureMutation[];
  readonly generated_at: string;
}
