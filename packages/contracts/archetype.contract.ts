import type { ArchitectureId, ContractMetadata, FrameworkId } from './shared.contract';
import type { LocaleCode } from './locale.contract';

export enum ArchetypeCategory {
  FRONTEND = 'frontend',
  APPLICATION = 'application',
  BACKEND = 'backend',
  AI = 'ai',
  ARCHITECTURE = 'architecture',
}

export enum ArchetypePreviewType {
  SITE = 'site',
  DASHBOARD = 'dashboard',
  API = 'api',
  PLATFORM = 'platform',
  SYSTEM = 'system',
}

export interface ArchetypeComplexityRangeContract {
  readonly minimum: number;
  readonly maximum: number;
}

export interface ArchetypeContract extends ContractMetadata {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: ArchetypeCategory;
  readonly supported_frameworks: readonly FrameworkId[];
  readonly recommended_frameworks: readonly FrameworkId[];
  readonly default_capabilities: readonly string[];
  readonly recommended_business_modules: readonly string[];
  readonly default_endpoints: readonly string[];
  readonly supported_architectures: readonly ArchitectureId[];
  readonly supported_locales: readonly LocaleCode[];
  readonly complexity_range: ArchetypeComplexityRangeContract;
  readonly preview_type: ArchetypePreviewType;
}
