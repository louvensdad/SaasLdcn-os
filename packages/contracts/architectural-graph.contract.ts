import type { ContractMetadata } from './shared.contract';

export type ArchitecturalNodeType =
  | 'client'
  | 'frontend'
  | 'gateway'
  | 'backend'
  | 'service'
  | 'auth'
  | 'database'
  | 'cache'
  | 'queue'
  | 'event_bus'
  | 'vector_db'
  | 'storage'
  | 'observability'
  | 'deployment'
  | 'external_provider';

export type ArchitecturalEdgeType =
  | 'sync'
  | 'async'
  | 'event'
  | 'queue'
  | 'cache'
  | 'data'
  | 'telemetry'
  | 'auth'
  | 'dependency';

export type ArchitecturalBurden = 'low' | 'medium' | 'high' | 'enterprise';
export type ArchitecturalRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface NodeHealth extends ContractMetadata {
  readonly status: 'healthy' | 'watch' | 'degraded';
  readonly summary: string;
}

export interface NodeRisk extends ContractMetadata {
  readonly level: ArchitecturalRiskLevel;
  readonly score: number;
  readonly warnings: readonly string[];
}

export interface NodeReadiness extends ContractMetadata {
  readonly score: number;
  readonly status: 'ready' | 'warning' | 'blocked';
  readonly recommendations: readonly string[];
}

export interface NodeOwnership extends ContractMetadata {
  readonly role: string;
  readonly required_skills: readonly string[];
  readonly boundary: string;
}

export interface ArchitecturalNode extends ContractMetadata {
  readonly id: string;
  readonly label: string;
  readonly type: ArchitecturalNodeType;
  readonly category: string;
  readonly status: NodeHealth['status'];
  readonly burden_score: ArchitecturalBurden;
  readonly risk_level: ArchitecturalRiskLevel;
  readonly readiness_score: number;
  readonly ownership_role: string;
  readonly required_skills: readonly string[];
  readonly warnings: readonly string[];
  readonly recommendations: readonly string[];
  readonly health: NodeHealth;
  readonly risk: NodeRisk;
  readonly readiness: NodeReadiness;
  readonly ownership: NodeOwnership;
}

export interface ArchitecturalEdge extends ContractMetadata {
  readonly id: string;
  readonly source_id: string;
  readonly target_id: string;
  readonly type: ArchitecturalEdgeType;
  readonly label: string;
  readonly animated: boolean;
  readonly warning?: string | null;
}

export interface GraphLayoutPoint {
  readonly node_id: string;
  readonly x: number;
  readonly y: number;
  readonly layer: number;
}

export interface GraphLayout extends ContractMetadata {
  readonly width: number;
  readonly height: number;
  readonly direction: 'horizontal' | 'vertical';
  readonly simplified_mobile: boolean;
  readonly points: readonly GraphLayoutPoint[];
}

export interface ArchitecturalGraph extends ContractMetadata {
  readonly graph_id: string;
  readonly architecture_id: string;
  readonly nodes: readonly ArchitecturalNode[];
  readonly edges: readonly ArchitecturalEdge[];
  readonly layout: GraphLayout;
  readonly warnings: readonly string[];
  readonly recommendations: readonly string[];
}

export interface GraphSnapshot extends ContractMetadata {
  readonly graph: ArchitecturalGraph;
  readonly source: 'preview' | 'project_snapshot';
  readonly generated_at: string;
}
