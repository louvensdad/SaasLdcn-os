import type {
  ArchitectureId,
  ContractMetadata,
  FrameworkId,
  LanguageId,
  RuntimeId,
} from './shared.contract';

export enum LanguageEcosystem {
  JVM = 'jvm',
  JAVASCRIPT = 'javascript',
  PYTHON = 'python',
  DOTNET = 'dotnet',
  PHP = 'php',
  GO = 'go',
}

export enum LearningCurve {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum PerformanceProfile {
  MODERATE = 'moderate',
  HIGH = 'high',
  VERY_HIGH = 'very_high',
}

export enum ScalabilityProfile {
  TEAM = 'team',
  ENTERPRISE = 'enterprise',
  HYPERSCALE = 'hyperscale',
}

export interface LanguageContract extends ContractMetadata {
  readonly id: LanguageId;
  readonly name: string;
  readonly description: string;
  readonly ecosystem: LanguageEcosystem;
  readonly supported_runtimes: readonly RuntimeId[];
  readonly supported_frameworks: readonly FrameworkId[];
  readonly supported_architectures: readonly ArchitectureId[];
  readonly enterprise_score: number;
  readonly learning_curve: LearningCurve;
  readonly performance_profile: PerformanceProfile;
  readonly scalability_profile: ScalabilityProfile;
}
