export type Brand<T, B extends string> = T & { readonly __brand: B };

export type ContractVersion = `${number}.${number}.${number}`;
export type TimestampISO = Brand<string, 'TimestampISO'>;

export type ContractId = Brand<string, 'ContractId'>;
export type StackId = Brand<string, 'StackId'>;
export type LanguageId = Brand<string, 'LanguageId'>;
export type RuntimeId = Brand<string, 'RuntimeId'>;
export type FrameworkId = Brand<string, 'FrameworkId'>;
export type ArchitectureId = Brand<string, 'ArchitectureId'>;
export type ProjectId = Brand<string, 'ProjectId'>;
export type WizardId = Brand<string, 'WizardId'>;
export type StepId = Brand<string, 'StepId'>;
export type FieldId = Brand<string, 'FieldId'>;
export type GenerationId = Brand<string, 'GenerationId'>;
export type ArtifactId = Brand<string, 'ArtifactId'>;
export type TemplateId = Brand<string, 'TemplateId'>;
export type AgentId = Brand<string, 'AgentId'>;
export type ExecutionId = Brand<string, 'ExecutionId'>;
export type OrchestrationRunId = Brand<string, 'OrchestrationRunId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type ActionId = Brand<string, 'ActionId'>;
export type DownloadId = Brand<string, 'DownloadId'>;

export type ContractScalar = string | number | boolean | null;
export type ContractValue =
  | ContractScalar
  | readonly ContractValue[]
  | { readonly [key: string]: ContractValue };

export interface ContractMetadata {
  readonly contractVersion: ContractVersion;
  readonly createdAt?: TimestampISO;
  readonly updatedAt?: TimestampISO;
}
