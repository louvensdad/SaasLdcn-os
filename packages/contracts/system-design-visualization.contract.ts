import type { ContractMetadata } from './shared.contract';
import type { EngineeringRiskSeverity } from './engineering-readiness.contract';

export type SystemDesignNodeType =
  | 'client'
  | 'frontend'
  | 'backend'
  | 'gateway'
  | 'auth'
  | 'service'
  | 'database'
  | 'cache'
  | 'queue'
  | 'observability'
  | 'vector_db'
  | 'storage'
  | 'deployment'
  | 'external_provider';

export type SystemDesignEdgeType =
  | 'sync'
  | 'async'
  | 'queue'
  | 'auth'
  | 'cache'
  | 'data'
  | 'dependency'
  | 'event'
  | 'observability';

export type VisualizationZoneStatus = 'healthy' | 'warning' | 'blocked';

export interface ServiceNode extends ContractMetadata {
  readonly id: string;
  readonly label: string;
  readonly type: SystemDesignNodeType;
  readonly zone: string;
  readonly ownership: string;
  readonly detail: string;
  readonly emphasis: 'primary' | 'supporting' | 'risk';
}

export interface InfrastructureNode extends ContractMetadata {
  readonly id: string;
  readonly label: string;
  readonly type: SystemDesignNodeType;
  readonly provider: 'selected' | 'derived' | 'external';
  readonly ownership: string;
  readonly detail: string;
}

export interface VisualizationEdge extends ContractMetadata {
  readonly id: string;
  readonly source_id: string;
  readonly target_id: string;
  readonly type: SystemDesignEdgeType;
  readonly label: string;
  readonly animated: boolean;
}

export interface ArchitectureTopology extends ContractMetadata {
  readonly architecture_id: string;
  readonly complexity: 'low' | 'medium' | 'high' | 'enterprise';
  readonly nodes: readonly ServiceNode[];
  readonly edges: readonly VisualizationEdge[];
  readonly zones: readonly string[];
  readonly signals: readonly string[];
}

export interface InfrastructureTopology extends ContractMetadata {
  readonly nodes: readonly InfrastructureNode[];
  readonly edges: readonly VisualizationEdge[];
  readonly burden: 'low' | 'medium' | 'high' | 'enterprise';
  readonly ownership_signals: readonly string[];
}

export interface RuntimeFlow extends ContractMetadata {
  readonly nodes: readonly ServiceNode[];
  readonly edges: readonly VisualizationEdge[];
  readonly steps: readonly string[];
  readonly mode: 'simple' | 'bounded' | 'distributed' | 'evented';
}

export interface DependencyVisualization extends ContractMetadata {
  readonly nodes: readonly ServiceNode[];
  readonly edges: readonly VisualizationEdge[];
  readonly chains: readonly string[];
  readonly conflicts: readonly string[];
  readonly burden_signals: readonly string[];
}

export interface RiskZone extends ContractMetadata {
  readonly id: string;
  readonly label: string;
  readonly severity: EngineeringRiskSeverity;
  readonly category: string;
  readonly summary: string;
  readonly related_node_ids: readonly string[];
}

export interface ReadinessZone extends ContractMetadata {
  readonly id: string;
  readonly label: string;
  readonly score: number;
  readonly status: VisualizationZoneStatus;
  readonly summary: string;
}

export interface TeamTopology extends ContractMetadata {
  readonly nodes: readonly ServiceNode[];
  readonly edges: readonly VisualizationEdge[];
  readonly maturity: string;
  readonly coordination: string;
  readonly ownership_boundaries: readonly string[];
}

export interface DeploymentTopology extends ContractMetadata {
  readonly mode: 'local' | 'docker' | 'kubernetes' | 'edge' | 'serverless' | 'hybrid';
  readonly nodes: readonly InfrastructureNode[];
  readonly edges: readonly VisualizationEdge[];
  readonly deployment_burden: number;
  readonly operational_overhead: string;
  readonly scaling_impact: string;
}

export interface VisualizationSnapshot extends ContractMetadata {
  readonly architecture_topology: ArchitectureTopology;
  readonly infrastructure_topology: InfrastructureTopology;
  readonly runtime_flow: RuntimeFlow;
  readonly dependency_visualization: DependencyVisualization;
  readonly risk_zones: readonly RiskZone[];
  readonly readiness_zones: readonly ReadinessZone[];
  readonly team_topology: TeamTopology;
  readonly deployment_topology: DeploymentTopology;
}
