import type {
  ContractMetadata,
  ContractValue,
  StackId,
  TemplateId,
} from './shared.contract';
import type { LocaleCode } from './locale.contract';

export enum TemplateStatus {
  DRAFT = 'draft',
  READY = 'ready',
  DEPRECATED = 'deprecated',
  ARCHIVED = 'archived',
}

export enum TemplateVisibility {
  PRIVATE = 'private',
  TEAM = 'team',
  PUBLIC = 'public',
}

export interface TemplateBlueprintContract {
  readonly summary: string;
  readonly modules: readonly string[];
  readonly requiredFiles: readonly string[];
  readonly forbiddenFiles: readonly string[];
  readonly notes?: string[];
}

export interface TemplatePreviewContract {
  readonly title: string;
  readonly description: string;
  readonly highlights: readonly string[];
}

export interface TemplateContract extends ContractMetadata {
  readonly templateId: TemplateId;
  readonly templateCode: string;
  readonly name: string;
  readonly description: string;
  readonly stackId: StackId;
  readonly archetypeIds?: readonly string[];
  readonly supportedLocales: readonly LocaleCode[];
  readonly status: TemplateStatus;
  readonly visibility: TemplateVisibility;
  readonly blueprint: TemplateBlueprintContract;
  readonly preview: TemplatePreviewContract;
  readonly defaultAnswers: Record<string, ContractValue>;
  readonly promptSeed: string;
  readonly tags: readonly string[];
}

export type TemplateComplexity = 'low' | 'medium' | 'high';
export type TemplateMaturity = 'experimental' | 'stable' | 'mature';

export interface TemplateChangelogEntry {
  readonly version: string;
  readonly date: string;
  readonly changes: readonly string[];
}

export interface TemplateMarketplaceItem extends ContractMetadata {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly category: string;
  readonly supported_languages: readonly string[];
  readonly supported_frameworks: readonly string[];
  readonly supported_architectures: readonly string[];
  readonly supported_archetypes: readonly string[];
  readonly capabilities: readonly string[];
  readonly complexity: TemplateComplexity;
  readonly maturity: TemplateMaturity;
  readonly preview_images: readonly string[];
  readonly tags: readonly string[];
  readonly changelog: readonly TemplateChangelogEntry[];
}

export interface TemplateCatalogResponse extends ContractMetadata {
  readonly templates: readonly TemplateMarketplaceItem[];
  readonly categories: readonly string[];
}

export interface TemplateCompatibilityResponse extends ContractMetadata {
  readonly template_id: string;
  readonly compatible: boolean;
  readonly score: number;
  readonly matched: readonly string[];
  readonly missing: readonly string[];
  readonly warnings: readonly string[];
  readonly maturity_verified: boolean;
}

export interface TemplateRecommendationResponse extends ContractMetadata {
  readonly recommendations: readonly TemplateMarketplaceItem[];
  readonly compatibility: readonly TemplateCompatibilityResponse[];
}
