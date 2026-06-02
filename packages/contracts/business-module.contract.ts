import type { FrameworkId, ContractMetadata } from './shared.contract';

export enum BusinessModuleCategory {
  CORE = 'core',
  COMMERCE = 'commerce',
  OPERATIONS = 'operations',
  FINANCE = 'finance',
  COMMUNICATION = 'communication',
  GOVERNANCE = 'governance',
  EDUCATION = 'education',
}

export interface BusinessModuleContract extends ContractMetadata {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: BusinessModuleCategory;
  readonly recommended_capabilities: readonly string[];
  readonly default_endpoints: readonly string[];
  readonly required_fields: readonly string[];
  readonly optional_fields: readonly string[];
  readonly supported_frameworks: readonly FrameworkId[];
}
