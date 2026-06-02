import type { ContractMetadata } from './shared.contract';

export enum CompatibilityEntityType {
  LANGUAGE = 'language',
  RUNTIME = 'runtime',
  FRAMEWORK = 'framework',
  ARCHITECTURE = 'architecture',
  STACK = 'stack',
  ARCHETYPE = 'archetype',
  CAPABILITY = 'capability',
  BUSINESS_MODULE = 'business_module',
  ENDPOINT = 'endpoint',
}

export enum CompatibilityRuleType {
  REQUIRES = 'requires',
  RECOMMENDS = 'recommends',
  CONFLICTS_WITH = 'conflicts_with',
  DISALLOWS = 'disallows',
  SUPPORTS = 'supports',
}

export enum CompatibilitySeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
}

export interface CompatibilityRuleContract extends ContractMetadata {
  readonly id: string;
  readonly source_type: CompatibilityEntityType;
  readonly source_id: string;
  readonly target_type: CompatibilityEntityType;
  readonly target_id: string;
  readonly rule_type: CompatibilityRuleType;
  readonly severity: CompatibilitySeverity;
  readonly message: string;
  readonly suggestion?: string;
}
