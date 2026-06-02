import type { ContractMetadata, FrameworkId, LanguageId, RuntimeId } from './shared.contract';

export interface FrameworkRecommendation extends ContractMetadata {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly priority: 'primary' | 'secondary' | 'advanced' | 'future';
}

export interface FrameworkArchitectureGuidance extends ContractMetadata {
  readonly architecture_id: string;
  readonly architecture_name: string;
  readonly summary: string;
  readonly rationale: string;
  readonly tradeoff: string;
}

export interface FrameworkCapabilityGuidance extends ContractMetadata {
  readonly capability_id: string;
  readonly capability_name: string;
  readonly summary: string;
  readonly rationale: string;
  readonly priority: 'core' | 'recommended' | 'optional';
}

export interface FrameworkEndpointGuidance extends ContractMetadata {
  readonly endpoint_group: string;
  readonly title: string;
  readonly summary: string;
  readonly recommended_endpoints: readonly string[];
}

export interface FrameworkTradeoff extends ContractMetadata {
  readonly title: string;
  readonly summary: string;
  readonly impact: 'low' | 'medium' | 'high';
}

export interface FrameworkReadinessProfile extends ContractMetadata {
  readonly level: 'baseline' | 'practical' | 'enterprise' | 'advanced';
  readonly label: string;
  readonly summary: string;
  readonly signals: readonly string[];
  readonly risks: readonly string[];
  readonly next_steps: readonly string[];
  readonly score: number;
}

export interface FrameworkSpecialistProfile extends ContractMetadata {
  readonly framework_id: FrameworkId;
  readonly language_id: LanguageId;
  readonly runtime_id: RuntimeId;
  readonly framework_name: string;
  readonly specialist_label: string;
  readonly summary: string;
  readonly best_for: readonly string[];
  readonly avoid_when: readonly string[];
  readonly recommended_architectures: readonly FrameworkArchitectureGuidance[];
  readonly supported_archetypes: readonly string[];
  readonly recommended_capabilities: readonly FrameworkCapabilityGuidance[];
  readonly recommended_business_modules: readonly string[];
  readonly recommended_endpoint_groups: readonly FrameworkEndpointGuidance[];
  readonly tradeoffs: readonly FrameworkTradeoff[];
  readonly testing_strategy: readonly string[];
  readonly security_baseline: readonly string[];
  readonly deployment_baseline: readonly string[];
  readonly infrastructure_baseline: readonly string[];
  readonly observability_baseline: readonly string[];
  readonly common_pitfalls: readonly string[];
  readonly complexity_notes: readonly string[];
  readonly readiness_profile: FrameworkReadinessProfile;
}
