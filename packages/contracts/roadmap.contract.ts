import type { ContractMetadata } from './shared.contract';

export type RoadmapStatus = 'IMPLEMENTED' | 'IN_PROGRESS' | 'PLANNED' | 'FUTURE' | 'ARCHIVED';

export interface RoadmapItem extends ContractMetadata {
  readonly id: string;
  readonly title: string;
  readonly category: 'module' | 'engine' | 'registry' | 'visualization' | 'template' | 'skill' | 'extension';
  readonly status: RoadmapStatus;
  readonly summary: string;
}

export interface RoadmapResponse extends ContractMetadata {
  readonly items: readonly RoadmapItem[];
  readonly statuses: readonly RoadmapStatus[];
}
