import type { ArchitectureId, ContractMetadata, FrameworkId } from './shared.contract';

export enum CapabilityCategory {
  SECURITY = 'security',
  PLATFORM = 'platform',
  COMMERCE = 'commerce',
  COMMUNICATION = 'communication',
  AI = 'ai',
  DATA = 'data',
  QUALITY = 'quality',
  EXPERIENCE = 'experience',
}

export enum CapabilitySecurityImpact {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum CapabilityGenerationImpact {
  NONE = 'none',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export interface CapabilityContract extends ContractMetadata {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: CapabilityCategory;
  readonly supported_frameworks: readonly FrameworkId[];
  readonly requires: readonly string[];
  readonly conflicts_with: readonly string[];
  readonly recommended_endpoints: readonly string[];
  readonly architecture_ids: readonly ArchitectureId[];
  readonly security_impact: CapabilitySecurityImpact;
  readonly generation_impact: CapabilityGenerationImpact;
}
