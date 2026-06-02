import type {
  ArchitectureId,
  ContractMetadata,
  FrameworkId,
} from './shared.contract';
import type { ScalabilityProfile } from './language.contract';

export enum ArchitectureComplexityLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  VERY_HIGH = 'very_high',
}

export enum DeploymentComplexity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  VERY_HIGH = 'very_high',
}

export interface ArchitectureContract extends ContractMetadata {
  readonly id: ArchitectureId;
  readonly name: string;
  readonly description: string;
  readonly complexity_level: ArchitectureComplexityLevel;
  readonly supported_frameworks: readonly FrameworkId[];
  readonly required_capabilities: readonly string[];
  readonly recommended_capabilities: readonly string[];
  readonly scalability_profile: ScalabilityProfile;
  readonly deployment_complexity: DeploymentComplexity;
}
