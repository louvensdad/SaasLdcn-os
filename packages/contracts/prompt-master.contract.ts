import type { BlueprintGenerationMode, ProjectBlueprint } from './blueprint.contract';
import type { LocaleCode } from './locale.contract';
import type { ContractId, ContractMetadata } from './shared.contract';

export type PromptMasterSectionId =
  | 'product_intent'
  | 'technology_graph'
  | 'architecture_profile'
  | 'business_modules'
  | 'endpoint_plan'
  | 'capability_plan'
  | 'security_requirements'
  | 'data_model_hints'
  | 'testing_requirements'
  | 'documentation_requirements'
  | 'quality_gates'
  | 'forbidden_decisions'
  | 'generation_constraints'
  | 'locale_language_rules'
  | 'trace';

export interface PromptMasterSection {
  readonly id: PromptMasterSectionId;
  readonly title: string;
  readonly summary: string;
  readonly content: string;
  readonly bullets: readonly string[];
}

export interface PromptMasterValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly related_section_ids: readonly PromptMasterSectionId[];
}

export interface PromptMasterValidation {
  readonly valid: boolean;
  readonly errors: readonly PromptMasterValidationIssue[];
  readonly warnings: readonly PromptMasterValidationIssue[];
  readonly constraints: readonly string[];
}

export interface PromptMasterVersion {
  readonly document_version: string;
  readonly engine_version: string;
  readonly blueprint_contract_version?: string;
  readonly generated_at: string;
}

export interface PromptMasterTrace {
  readonly blueprint_id: ProjectBlueprint['blueprint_id'] | string;
  readonly source_selection_ids: {
    readonly language_id: string;
    readonly runtime_id: string;
    readonly framework_id: string;
    readonly architecture_id: string;
    readonly archetype_id: string;
    readonly capability_ids: readonly string[];
    readonly business_module_ids: readonly string[];
    readonly endpoint_ids: readonly string[];
  };
  readonly included_sections: readonly PromptMasterSectionId[];
  readonly redacted_fields: readonly string[];
  readonly contains_secrets: boolean;
}

export interface PromptMasterDocument extends ContractMetadata {
  readonly prompt_master_id: ContractId | string;
  readonly blueprint_id: ProjectBlueprint['blueprint_id'] | string;
  readonly project_name: string;
  readonly locale: LocaleCode;
  readonly generation_mode: BlueprintGenerationMode;
  readonly source_blueprint_valid: boolean;
  readonly version: PromptMasterVersion;
  readonly validation: PromptMasterValidation;
  readonly sections: readonly PromptMasterSection[];
  readonly trace: PromptMasterTrace;
  readonly compiled_prompt: string;
  readonly generated_at: string;
}

export interface PromptMasterPreviewPayload {
  readonly blueprint?: ProjectBlueprint;
  readonly blueprint_id?: string;
}
