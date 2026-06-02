import type { ContractMetadata, StackId } from './shared.contract';
import type { LocaleCode } from './locale.contract';

export enum StackCategory {
  MARKETING = 'marketing',
  FRONTEND = 'frontend',
  BACKEND = 'backend',
  FULL_STACK = 'full_stack',
}

export enum StackStatus {
  ACTIVE = 'active',
  EXPERIMENTAL = 'experimental',
  DEPRECATED = 'deprecated',
  DISABLED = 'disabled',
}

export enum StackGenerationMode {
  FOUNDATION = 'foundation',
  TEMPLATE_ASSISTED = 'template_assisted',
  GUIDED = 'guided',
}

export enum StackArchitecture {
  STATIC_EXPORT = 'static_export',
  SINGLE_PAGE_APP = 'single_page_app',
  MODULAR_MONOLITH = 'modular_monolith',
  LAYERED_MONOLITH = 'layered_monolith',
  CLEAN_ARCHITECTURE = 'clean_architecture',
  DOMAIN_MODULAR = 'domain_modular',
  APP_ROUTER = 'app_router',
}

export type StackFieldId =
  | 'project_name'
  | 'site_type'
  | 'audience'
  | 'sections'
  | 'style_direction'
  | 'seo_goal'
  | 'contact_form'
  | 'locale'
  | 'business_domain'
  | 'api_modules'
  | 'database'
  | 'auth_strategy'
  | 'async_jobs'
  | 'docs_required'
  | 'architecture_style'
  | 'messaging'
  | 'docker_required'
  | 'observability'
  | 'ai_agents_required'
  | 'queue_required'
  | 'site_or_app_type'
  | 'rendering_strategy'
  | 'auth_required'
  | 'seo_required'
  | 'cms_required'
  | 'design_direction';

export interface StackFeatureContract {
  readonly key: string;
  readonly label: string;
  readonly description: string;
}

export interface StackConstraintContract {
  readonly key: string;
  readonly level: 'info' | 'warning' | 'error';
  readonly message: string;
}

export interface StackWizardProfileContract {
  readonly profileId: string;
  readonly entryStep: string;
  readonly recommendedFlow: readonly string[];
  readonly validationMode: 'light' | 'standard' | 'strict';
}

export interface StackTemplateCompatibilityContract {
  readonly compatibleTemplateIds: readonly string[];
  readonly defaultTemplateId?: string;
  readonly supportsBlankStart: boolean;
}

export interface StackGatekeeperProfileContract {
  readonly profileId: string;
  readonly releaseStage: 'foundation' | 'validated' | 'restricted';
  readonly blockedCapabilities: readonly string[];
  readonly requiredChecks: readonly string[];
}

export interface StackContract extends ContractMetadata {
  readonly id: StackId;
  readonly name: string;
  readonly category: StackCategory;
  readonly status: StackStatus;
  readonly description: string;
  readonly supported_locales: readonly LocaleCode[];
  readonly supported_generation_modes: readonly StackGenerationMode[];
  readonly allowed_architectures: readonly StackArchitecture[];
  readonly required_fields: readonly StackFieldId[];
  readonly optional_fields: readonly StackFieldId[];
  readonly features: readonly StackFeatureContract[];
  readonly constraints: readonly StackConstraintContract[];
  readonly wizard_profile: StackWizardProfileContract;
  readonly template_compatibility: StackTemplateCompatibilityContract;
  readonly gatekeeper_profile: StackGatekeeperProfileContract;
}
