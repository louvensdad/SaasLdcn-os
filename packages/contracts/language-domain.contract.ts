import type { ArchitectureContract } from './architecture.contract';
import type { ArchetypeContract } from './archetype.contract';
import type { CapabilityContract } from './capability.contract';
import type { ContractMetadata, LanguageId } from './shared.contract';
import type { FrameworkContract } from './framework.contract';

export type LanguageDomainRecommendationPriority = 'primary' | 'secondary' | 'advanced' | 'future';

export interface LanguageDomainProfileContract extends ContractMetadata {
  readonly language_id: LanguageId;
  readonly name: string;
  readonly ecosystem: string;
  readonly summary: string;
  readonly primary_use_cases: readonly string[];
  readonly strengths: readonly string[];
  readonly tradeoffs: readonly string[];
  readonly recommended_for: readonly string[];
  readonly framework_count: number;
  readonly architecture_count: number;
  readonly capability_count: number;
  readonly enterprise_score: number;
  readonly learning_curve: string;
  readonly scalability_profile: string;
}

export interface LanguageDomainRecommendationContract extends ContractMetadata {
  readonly language_id: LanguageId;
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly priority: LanguageDomainRecommendationPriority;
}

export interface LanguageDomainFrameworkSetContract extends ContractMetadata {
  readonly language_id: LanguageId;
  readonly frameworks: readonly FrameworkContract[];
}

export interface LanguageDomainArchitectureSetContract extends ContractMetadata {
  readonly language_id: LanguageId;
  readonly architectures: readonly ArchitectureContract[];
}

export interface LanguageDomainCapabilitySetContract extends ContractMetadata {
  readonly language_id: LanguageId;
  readonly capabilities: readonly CapabilityContract[];
}

export type LanguageDomainFrameworkSet = LanguageDomainFrameworkSetContract;
export type LanguageDomainArchitectureSet = LanguageDomainArchitectureSetContract;
export type LanguageDomainCapabilitySet = LanguageDomainCapabilitySetContract;
export type LanguageDomainProfile = LanguageDomainProfileContract;
export type LanguageDomainRecommendation = LanguageDomainRecommendationContract;
