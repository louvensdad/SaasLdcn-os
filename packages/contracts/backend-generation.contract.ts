import type { ContractMetadata, ContractValue } from './shared.contract';
import type { GeneratedProjectLocaleProfile } from './locale.contract';

export type BackendLanguage = 'python' | 'java' | 'typescript';
export type BackendFramework = 'fastapi' | 'spring_boot' | 'quarkus' | 'micronaut' | 'nestjs' | 'express' | 'fastify';
export type BackendGenerationStatus = 'previewed' | 'generated' | 'blocked' | 'failed';
export type BackendArtifactKind = 'file' | 'directory' | 'metadata';
export type BackendCapability =
  | 'jwt'
  | 'postgresql'
  | 'sqlite'
  | 'h2'
  | 'swagger'
  | 'openapi'
  | 'health'
  | 'validation';

export interface GenerationTarget {
  readonly language: BackendLanguage | string;
  readonly framework: BackendFramework | string;
  readonly output_path?: string | null;
  readonly project_name?: string | null;
}

export interface GenerationProfile {
  readonly profile_id: string;
  readonly capabilities: readonly BackendCapability[];
  readonly database?: 'sqlite' | 'postgresql' | 'h2' | 'none' | string | null;
  readonly complexity?: 'basic' | 'crud' | 'auth' | 'production' | 'clean' | string | null;
}

export interface GeneratedArtifact extends ContractMetadata {
  readonly id: string;
  readonly kind: BackendArtifactKind;
  readonly relative_path: string;
  readonly size_bytes: number;
  readonly checksum: string;
}

export interface GenerationValidation extends ContractMetadata {
  readonly status: 'passed' | 'blocked' | 'failed';
  readonly generation_enabled: boolean;
  readonly security_gate: 'passed' | 'blocked';
  readonly handoff_readiness: 'ready' | 'blocked' | 'incomplete';
  readonly checks: readonly {
    readonly id: string;
    readonly status: 'passed' | 'blocked' | 'failed';
    readonly message: string;
  }[];
  readonly failures: readonly {
    readonly code: string;
    readonly message: string;
    readonly recoverable: boolean;
    readonly related_ids: readonly string[];
  }[];
}

export interface GeneratedProjectMetrics extends ContractMetadata {
  readonly file_count: number;
  readonly directory_count: number;
  readonly total_size_bytes: number;
  readonly complexity: string;
  readonly framework: string;
  readonly template_id: string;
}

export interface GenerationManifest extends ContractMetadata {
  readonly generation_id: string;
  readonly project_id?: string | null;
  readonly project_name: string;
  readonly status: BackendGenerationStatus;
  readonly target: GenerationTarget;
  readonly profile: GenerationProfile;
  readonly template_id: string;
  readonly template_name: string;
  readonly output_path?: string | null;
  readonly artifacts: readonly GeneratedArtifact[];
  readonly file_tree: readonly string[];
  readonly validation: GenerationValidation;
  readonly metrics: GeneratedProjectMetrics;
  readonly metadata: Readonly<Record<string, ContractValue>>;
}

export interface BackendGenerationRequest {
  readonly project_id: string;
  readonly target: GenerationTarget;
  readonly profile: GenerationProfile;
  readonly locale_profile?: GeneratedProjectLocaleProfile;
}

export interface BackendGenerationTemplate extends ContractMetadata {
  readonly template_id: string;
  readonly name: string;
  readonly language: BackendLanguage;
  readonly framework: BackendFramework;
  readonly profiles: readonly string[];
  readonly implemented: boolean;
  readonly capabilities: readonly BackendCapability[];
}

export interface BackendGenerationTemplateCatalog extends ContractMetadata {
  readonly templates: readonly BackendGenerationTemplate[];
}
