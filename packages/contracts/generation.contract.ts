import type {
  ArchitectureId,
  ArtifactId,
  ContractMetadata,
  ContractValue,
  DownloadId,
  FrameworkId,
  GenerationId,
  LanguageId,
  OrchestrationRunId,
  ProjectId,
  RuntimeId,
  StackId,
  TemplateId,
  TimestampISO,
  WizardId,
} from './shared.contract';
import type { LocaleCode } from './locale.contract';

export enum GenerationStatus {
  REQUESTED = 'requested',
  VALIDATING = 'validating',
  GENERATING = 'generating',
  PACKAGING = 'packaging',
  READY = 'ready',
  FAILED = 'failed',
}

export enum GenerationStage {
  PLAN = 'plan',
  FILE_SCHEME = 'file_scheme',
  WRITE = 'write',
  VALIDATE = 'validate',
  PACKAGE = 'package',
  COMPLETE = 'complete',
}

export enum GenerationArtifactKind {
  FILE = 'file',
  FOLDER = 'folder',
  DOC = 'doc',
  CONFIG = 'config',
  REPORT = 'report',
  ASSET = 'asset',
}

export enum GenerationValidationSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
}

export interface GenerationRequestContract {
  readonly generationId: GenerationId;
  readonly projectId: ProjectId;
  readonly stackId: StackId;
  readonly languageId?: LanguageId;
  readonly runtimeId?: RuntimeId;
  readonly frameworkId?: FrameworkId;
  readonly architectureId?: ArchitectureId;
  readonly archetypeId?: string;
  readonly capabilityIds?: readonly string[];
  readonly businessModuleIds?: readonly string[];
  readonly endpointIds?: readonly string[];
  readonly outputLocale: LocaleCode;
  readonly templateId?: TemplateId;
  readonly wizardId?: WizardId;
  readonly orchestrationRunId?: OrchestrationRunId;
  readonly requestedAt: TimestampISO;
  readonly requestedBy: string;
  readonly options: Record<string, ContractValue>;
}

export interface GenerationArtifactContract {
  readonly artifactId: ArtifactId;
  readonly kind: GenerationArtifactKind;
  readonly relativePath: string;
  readonly checksum?: string;
  readonly sizeBytes?: number;
  readonly generatedAt: TimestampISO;
}

export interface GenerationTraceEntryContract {
  readonly timestamp: TimestampISO;
  readonly stage: GenerationStage;
  readonly message: string;
  readonly actor: string;
  readonly severity: GenerationValidationSeverity;
}

export interface GenerationValidationIssueContract {
  readonly issueId: string;
  readonly code: string;
  readonly message: string;
  readonly severity: GenerationValidationSeverity;
  readonly path?: string;
}

export interface GenerationValidationReportContract {
  readonly passed: boolean;
  readonly summary: string;
  readonly issues: readonly GenerationValidationIssueContract[];
}

export interface GenerationDownloadContract {
  readonly downloadId: DownloadId;
  readonly zipFileName: string;
  readonly zipPath: string;
  readonly safe: boolean;
}

export interface GenerationContract extends ContractMetadata {
  readonly generationId: GenerationId;
  readonly projectId: ProjectId;
  readonly stackId: StackId;
  readonly languageId?: LanguageId;
  readonly runtimeId?: RuntimeId;
  readonly frameworkId?: FrameworkId;
  readonly architectureId?: ArchitectureId;
  readonly archetypeId?: string;
  readonly capabilityIds?: readonly string[];
  readonly businessModuleIds?: readonly string[];
  readonly endpointIds?: readonly string[];
  readonly outputLocale: LocaleCode;
  readonly templateId?: TemplateId;
  readonly wizardId?: WizardId;
  readonly orchestrationRunId?: OrchestrationRunId;
  readonly status: GenerationStatus;
  readonly stage: GenerationStage;
  readonly outputRoot: string;
  readonly projectPath: string;
  readonly artifacts: readonly GenerationArtifactContract[];
  readonly trace: readonly GenerationTraceEntryContract[];
  readonly validationReport: GenerationValidationReportContract;
  readonly download?: GenerationDownloadContract;
  readonly startedAt: TimestampISO;
  readonly completedAt?: TimestampISO;
}
