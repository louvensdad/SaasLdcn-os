import type {
  ArchitectureId,
  ContractMetadata,
  ContractValue,
  FieldId,
  FrameworkId,
  LanguageId,
  ProjectId,
  RuntimeId,
  StackId,
  StepId,
  WizardId,
} from './shared.contract';
import type { LocaleCode } from './locale.contract';

export enum WizardStatus {
  DRAFT = 'draft',
  IN_PROGRESS = 'in_progress',
  VALIDATING = 'validating',
  BLOCKED = 'blocked',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum WizardStepKind {
  INTRO = 'intro',
  LANGUAGE = 'language',
  RUNTIME = 'runtime',
  FRAMEWORK = 'framework',
  ARCHETYPE = 'archetype',
  REQUIREMENTS = 'requirements',
  ARCHITECTURE = 'architecture',
  CAPABILITY = 'capability',
  BUSINESS_MODULE = 'business_module',
  ENDPOINT = 'endpoint',
  REVIEW = 'review',
  FINALIZE = 'finalize',
}

export enum WizardFieldKind {
  TEXT = 'text',
  TEXTAREA = 'textarea',
  SELECT = 'select',
  MULTI_SELECT = 'multi_select',
  TOGGLE = 'toggle',
  NUMBER = 'number',
  JSON = 'json',
}

export enum WizardValidationSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
}

export interface WizardOptionContract {
  readonly optionId: string;
  readonly label: string;
  readonly value: string;
  readonly description?: string;
}

export interface WizardFieldContract {
  readonly fieldId: FieldId;
  readonly key: string;
  readonly label: string;
  readonly kind: WizardFieldKind;
  readonly required: boolean;
  readonly placeholder?: string;
  readonly helperText?: string;
  readonly options?: readonly WizardOptionContract[];
  readonly defaultValue?: ContractValue;
}

export interface WizardStepContract {
  readonly stepId: StepId;
  readonly title: string;
  readonly description?: string;
  readonly order: number;
  readonly kind: WizardStepKind;
  readonly canSkip: boolean;
  readonly fields: readonly WizardFieldContract[];
}

export interface WizardValidationIssueContract {
  readonly issueId: string;
  readonly fieldKey?: string;
  readonly message: string;
  readonly severity: WizardValidationSeverity;
}

export type WizardAnswerValue =
  | string
  | number
  | boolean
  | null
  | readonly string[]
  | { readonly [key: string]: ContractValue };

export type WizardAnswerMap = Record<string, WizardAnswerValue>;

export interface WizardContract extends ContractMetadata {
  readonly wizardId: WizardId;
  readonly projectId?: ProjectId;
  readonly languageId?: LanguageId;
  readonly runtimeId?: RuntimeId;
  readonly frameworkId?: FrameworkId;
  readonly architectureId?: ArchitectureId;
  readonly stackId?: StackId;
  readonly archetypeId?: string;
  readonly capabilityIds?: readonly string[];
  readonly businessModuleIds?: readonly string[];
  readonly endpointIds?: readonly string[];
  readonly locale: LocaleCode;
  readonly status: WizardStatus;
  readonly currentStepId?: StepId;
  readonly steps: readonly WizardStepContract[];
  readonly answers: WizardAnswerMap;
  readonly validationIssues: readonly WizardValidationIssueContract[];
}
