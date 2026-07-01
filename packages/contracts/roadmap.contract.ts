import type { ContractMetadata } from './shared.contract';

export type RoadmapStatus = 'IMPLEMENTED' | 'IN_PROGRESS' | 'PLANNED' | 'FUTURE' | 'ARCHIVED';
export type RoadmapPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type RoadmapMaturity = 'PROTOTYPE' | 'ALPHA' | 'BETA' | 'PRODUCTION_READY' | 'ENTERPRISE';
export type RoadmapRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type RoadmapReleaseStatus = 'DELIVERED' | 'ACTIVE' | 'PLANNED';

export interface RoadmapRelease extends ContractMetadata {
  readonly id: string;
  readonly title: string;
  readonly date: string;
  readonly status: RoadmapReleaseStatus;
  readonly progress: number;
  readonly features: readonly string[];
  readonly dependencies: readonly string[];
  readonly risks: readonly string[];
}

export interface RoadmapTimelineStep extends ContractMetadata {
  readonly id: string;
  readonly title: string;
  readonly status: RoadmapStatus;
  readonly description: string;
  readonly dependencies: readonly string[];
  readonly engines: readonly string[];
  readonly apis: readonly string[];
  readonly documentation: readonly string[];
}

export interface RoadmapDependencyEdge extends ContractMetadata {
  readonly source: string;
  readonly target: string;
  readonly kind: 'dependency' | 'impact';
  readonly impact: string;
}

export interface RoadmapGauge extends ContractMetadata {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly status: 'healthy' | 'warning' | 'blocked';
  readonly basis: string;
}

export interface RoadmapMetric extends ContractMetadata {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}

export interface RoadmapSprint extends ContractMetadata {
  readonly id: string;
  readonly title: string;
  readonly status: 'ACTIVE' | 'PLANNED';
  readonly progress: number;
  readonly tasks: number;
  readonly completed: number;
  readonly in_progress: number;
}

export interface RoadmapItem extends ContractMetadata {
  readonly id: string;
  readonly title: string;
  readonly category:
    | 'module'
    | 'engine'
    | 'registry'
    | 'visualization'
    | 'template'
    | 'skill'
    | 'extension'
    | 'agent'
    | 'infrastructure'
    | 'backend'
    | 'frontend'
    | 'ai'
    | 'security'
    | 'deploy'
    | 'architecture'
    | 'documentation'
    | 'laboratory';
  readonly status: RoadmapStatus;
  readonly summary: string;
  readonly progress: number;
  readonly dependencies: readonly string[];
  readonly release: string;
  readonly updated_at: string;
  readonly owner: string;
  readonly priority: RoadmapPriority;
  readonly maturity: RoadmapMaturity;
  readonly risk: RoadmapRisk;
  readonly risk_basis: readonly string[];
  readonly engines: readonly string[];
  readonly apis: readonly string[];
  readonly skills: readonly string[];
  readonly contracts: readonly string[];
  readonly documentation: readonly string[];
  readonly impact: string;
  readonly tags: readonly string[];
}

export interface RoadmapResponse extends ContractMetadata {
  readonly items: readonly RoadmapItem[];
  readonly statuses: readonly RoadmapStatus[];
  readonly releases: readonly RoadmapRelease[];
  readonly platform_timeline: readonly RoadmapTimelineStep[];
  readonly dependency_edges: readonly RoadmapDependencyEdge[];
  readonly impact_edges: readonly RoadmapDependencyEdge[];
  readonly executive_health: readonly RoadmapGauge[];
  readonly coverage: readonly RoadmapGauge[];
  readonly platform_metrics: readonly RoadmapMetric[];
  readonly statistics: readonly RoadmapMetric[];
  readonly sprints: readonly RoadmapSprint[];
}
