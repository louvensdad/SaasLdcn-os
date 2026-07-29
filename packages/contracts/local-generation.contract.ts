import type { GenerationHandoffPackage } from './generation-handoff.contract';
import type { ContractMetadata, ContractValue } from './shared.contract';
import type { GeneratedProjectLocaleProfile } from './locale.contract';

export type GenerationRuntime = 'local_static_v0';
export type LocalGenerationStatus = 'generated' | 'blocked' | 'failed';
export type GeneratedArtifactKind = 'file' | 'directory' | 'metadata';
export type GeneratedProjectSecurityState = 'safe' | 'filtered' | 'blocked';

export interface LocalGenerationRequest {
  readonly project_id: string;
  readonly output_path: string;
  readonly locale_profile?: GeneratedProjectLocaleProfile;
}

export interface GeneratedArtifact extends ContractMetadata {
  readonly id: string;
  readonly kind: GeneratedArtifactKind;
  readonly relative_path: string;
  readonly size_bytes: number;
  readonly checksum: string;
}

export interface GenerationTrace extends ContractMetadata {
  readonly timestamp: string;
  readonly step: string;
  readonly status: 'started' | 'completed' | 'blocked' | 'failed';
  readonly message: string;
  readonly safe: boolean;
}

export interface GenerationFailure extends ContractMetadata {
  readonly code: string;
  readonly message: string;
  readonly recoverable: boolean;
  readonly related_ids: readonly string[];
}

export interface GeneratedFileMap extends ContractMetadata {
  readonly root_path: string;
  readonly files: readonly {
    readonly relative_path: string;
    readonly size_bytes: number;
    readonly checksum: string;
  }[];
  readonly directories: readonly string[];
}

export interface LocalGenerationResult extends ContractMetadata {
  readonly generation_id: string;
  readonly project_id: string;
  readonly project_name: string;
  readonly status: LocalGenerationStatus;
  readonly runtime: GenerationRuntime;
  readonly template_id?: string | null;
  readonly template_name?: string | null;
  readonly output_path: string;
  readonly handoff_readiness: GenerationHandoffPackage['handoff_readiness'];
  readonly artifacts: readonly GeneratedArtifact[];
  readonly file_map: GeneratedFileMap;
  readonly trace: readonly GenerationTrace[];
  readonly failures: readonly GenerationFailure[];
  readonly metadata: Readonly<Record<string, ContractValue>>;
}

export interface GeneratedProjectSecurityStatus {
  readonly status: GeneratedProjectSecurityState;
  readonly message: string;
  readonly blocked_files: readonly string[];
  readonly blocked_count: number;
}

export interface GeneratedProjectFileEntry {
  readonly relative_path: string;
  readonly kind: 'file' | 'directory';
  readonly size_bytes: number;
  readonly checksum?: string | null;
  readonly extension?: string | null;
  readonly preview_supported: boolean;
}

export interface GeneratedProjectFilesResponse extends ContractMetadata {
  readonly project_id: string;
  readonly root_path: string;
  readonly files: readonly GeneratedProjectFileEntry[];
  readonly directories: readonly GeneratedProjectFileEntry[];
  readonly file_count: number;
  readonly total_size_bytes: number;
  readonly security: GeneratedProjectSecurityStatus;
}

export interface GeneratedFileContentResponse extends ContractMetadata {
  readonly project_id: string;
  readonly relative_path: string;
  readonly size_bytes: number;
  readonly preview_supported: boolean;
  readonly content_type: 'text' | 'binary' | 'unsupported';
  readonly content?: string | null;
  readonly unsupported_reason?: string | null;
}

export interface PreparedDownloadResponse extends ContractMetadata {
  readonly project_id: string;
  readonly status: 'prepared';
  readonly download_url: string;
  readonly zip_size_bytes: number;
  readonly file_count: number;
  readonly source_size_bytes: number;
  readonly security: GeneratedProjectSecurityStatus;
}
