import type { ArchitectureContract } from './architecture.contract';
import type { ArchetypeContract } from './archetype.contract';
import type { BusinessModuleContract } from './business-module.contract';
import type { CapabilityContract } from './capability.contract';
import type { DependencyGraphSnapshot } from './dependency-graph.contract';
import type { InfrastructureProfile } from './infrastructure.contract';
import type { EndpointContract } from './endpoint.contract';
import type { FrameworkContract } from './framework.contract';
import type { LanguageContract } from './language.contract';
import type { GeneratedProjectLocaleProfile, LocaleCode } from './locale.contract';
import type { RuntimeContract } from './runtime.contract';
import type { ContractId, ContractMetadata } from './shared.contract';

export type BlueprintGenerationMode =
  | 'foundation_only'
  | 'template_assisted'
  | 'guided'
  | 'local_build_90'
  | 'platform_boost_100'
  | 'user_key_boost';

export type BlueprintComplexityBand =
  | 'low'
  | 'medium'
  | 'high'
  | 'enterprise'
  | 'hyperscale';

export type BlueprintRecommendationType =
  | 'capability'
  | 'architecture'
  | 'operations'
  | 'security'
  | 'locale'
  | 'delivery'
  | 'module'
  | 'endpoint';

export type BlueprintRecommendationSeverity = 'info' | 'warning' | 'critical';
export type DeliveryTarget = 'zip' | 'github' | 'gitlab' | 'both';

export interface ProjectRequirements {
  readonly project_goal: string;
  readonly business_context: string;
  readonly target_users: readonly string[];
  readonly business_rules: readonly string[];
  readonly entities: readonly string[];
  readonly workflows: readonly string[];
  readonly constraints: readonly string[];
  readonly delivery_target?: DeliveryTarget | null;
}

export interface TechnologyGraph {
  readonly language: Pick<
    LanguageContract,
    'id' | 'name' | 'ecosystem' | 'enterprise_score' | 'learning_curve' | 'scalability_profile'
  >;
  readonly runtime: Pick<RuntimeContract, 'id' | 'name' | 'language_id' | 'performance_profile'>;
  readonly framework: Pick<
    FrameworkContract,
    'id' | 'name' | 'language_id' | 'runtime_id' | 'framework_type' | 'maturity_level' | 'enterprise_score'
  >;
  readonly architecture: Pick<
    ArchitectureContract,
    'id' | 'name' | 'complexity_level' | 'deployment_complexity' | 'scalability_profile'
  >;
}

export interface ArchitectureProfile {
  readonly architecture_id: string;
  readonly complexity_level: ArchitectureContract['complexity_level'];
  readonly deployment_complexity: ArchitectureContract['deployment_complexity'];
  readonly scalability_profile: ArchitectureContract['scalability_profile'];
  readonly required_infrastructure: readonly string[];
  readonly recommended_patterns: readonly string[];
}

export interface ArchetypeProfile {
  readonly archetype_id: string;
  readonly name: ArchetypeContract['name'];
  readonly category: ArchetypeContract['category'];
  readonly preview_type: ArchetypeContract['preview_type'];
  readonly supported_locales: readonly LocaleCode[];
}

export interface ComplexityProfile {
  readonly overall_score: number;
  readonly learning_curve: BlueprintComplexityBand;
  readonly implementation_effort: BlueprintComplexityBand;
  readonly infrastructure_cost: BlueprintComplexityBand;
  readonly maintenance_cost: BlueprintComplexityBand;
  readonly team_size_recommendation: string;
  readonly risk_level: BlueprintComplexityBand;
}

export interface BlueprintValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly related_item_ids: readonly string[];
}

export interface BlueprintValidation {
  readonly valid: boolean;
  readonly errors: readonly BlueprintValidationIssue[];
  readonly warnings: readonly BlueprintValidationIssue[];
  readonly suggestions: readonly string[];
}

export interface BlueprintRecommendation {
  readonly type: BlueprintRecommendationType;
  readonly message: string;
  readonly severity: BlueprintRecommendationSeverity;
  readonly related_item_id?: string;
}

export interface ProjectBlueprint extends ContractMetadata {
  readonly blueprint_id: ContractId | string;
  readonly project_name: string;
  readonly locale: LocaleCode;
  readonly locale_profile: GeneratedProjectLocaleProfile;
  readonly generation_mode: BlueprintGenerationMode;
  readonly project_requirements: ProjectRequirements;
  readonly technology_graph: TechnologyGraph;
  readonly architecture_profile: ArchitectureProfile;
  readonly archetype_profile: ArchetypeProfile;
  readonly infrastructure_profile: InfrastructureProfile;
  readonly capabilities: readonly CapabilityContract[];
  readonly business_modules: readonly BusinessModuleContract[];
  readonly endpoints: readonly EndpointContract[];
  readonly complexity_profile: ComplexityProfile;
  readonly validation: BlueprintValidation;
  readonly recommendations: readonly BlueprintRecommendation[];
  readonly dependency_graph_snapshot?: DependencyGraphSnapshot;
  readonly generated_at: string;
}
