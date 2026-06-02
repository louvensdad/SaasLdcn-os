import type {
  ArchitectureId,
  ContractMetadata,
  FrameworkId,
  LanguageId,
  RuntimeId,
} from './shared.contract';
import type { FrameworkType } from './framework-type.contract';

export enum FrameworkMaturityLevel {
  GROWING = 'growing',
  MATURE = 'mature',
  ENTERPRISE = 'enterprise',
}

export interface FrameworkContract extends ContractMetadata {
  readonly id: FrameworkId;
  readonly name: string;
  readonly language_id: LanguageId;
  readonly runtime_id: RuntimeId;
  readonly framework_type: FrameworkType;
  readonly description: string;
  readonly architecture_support: readonly ArchitectureId[];
  readonly archetype_support: readonly string[];
  readonly capability_support: readonly string[];
  readonly enterprise_score: number;
  readonly maturity_level: FrameworkMaturityLevel;
  readonly recommended_use_cases: readonly string[];
}
