import type { ContractMetadata } from './shared.contract';

export type SkillCategory = 'architecture' | 'planning' | 'generation' | 'support';
export type SkillMaturity = 'foundation' | 'stable' | 'reserved';
export type SkillExecutionMode = 'read_only' | 'manual_assist' | 'local_safe';

export interface SkillDependency extends ContractMetadata {
  readonly id: string;
  readonly label: string;
  readonly kind: 'endpoint' | 'registry' | 'template' | 'project' | 'report';
  readonly required: boolean;
}

export interface SkillMetadata extends ContractMetadata {
  readonly category: SkillCategory;
  readonly maturity: SkillMaturity;
  readonly execution_mode: SkillExecutionMode;
  readonly safe: boolean;
  readonly no_ai: boolean;
  readonly no_agents: boolean;
  readonly no_external_integrations: boolean;
}

export interface SkillDefinition extends ContractMetadata {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: SkillCategory;
  readonly tags: readonly string[];
  readonly requirements: readonly string[];
  readonly examples: readonly string[];
  readonly dependencies: readonly SkillDependency[];
  readonly metadata: SkillMetadata;
}

export interface SkillRecommendation extends ContractMetadata {
  readonly skill_id: string;
  readonly score: number;
  readonly reason: string;
  readonly unlocked: boolean;
}

export interface SkillPreview extends ContractMetadata {
  readonly skill_id: string;
  readonly title: string;
  readonly summary: string;
  readonly steps: readonly string[];
  readonly safety_notes: readonly string[];
  readonly execution_enabled: false;
}

export interface SkillCatalogResponse extends ContractMetadata {
  readonly skills: readonly SkillDefinition[];
  readonly categories: readonly SkillCategory[];
}

export interface SkillPreviewRequest {
  readonly skill_id: string;
  readonly project_id?: string | null;
  readonly context?: Record<string, unknown>;
}
