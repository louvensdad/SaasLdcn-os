import type { GatekeeperReport } from './gatekeeper.contract';
import type { GeneratedProjectSecurityStatus } from './local-generation.contract';
import type { ProjectRecord } from './project.contract';
import type { ContractId, ContractMetadata, ProjectId, TimestampISO } from './shared.contract';

export type GitExportProvider = 'github' | 'gitlab';
export type GitRepositoryVisibility = 'private' | 'public';
export type GitExportStatus =
  | 'pending'
  | 'validating'
  | 'exporting'
  | 'success'
  | 'failed'
  | 'blocked';

export interface GitExportRequest {
  readonly provider: GitExportProvider;
  readonly repo_name: string;
  readonly namespace: string;
  readonly visibility: GitRepositoryVisibility;
  readonly branch: string;
  readonly commit_message: string;
  readonly project_id: ProjectId | string;
  readonly credential_reference?: string | null;
  readonly temporary_token?: string | null;
}

export interface GitExportFileEntry {
  readonly relative_path: string;
  readonly size_bytes: number;
  readonly checksum: string;
}

export interface GitExportBlocker {
  readonly code: string;
  readonly problem: string;
  readonly reason: string;
  readonly action_label: string;
  readonly action_href: string;
}

export interface GitExportSecurityValidation extends ContractMetadata {
  readonly status: GeneratedProjectSecurityStatus['status'];
  readonly message: string;
  readonly gatekeeper_decision?: GatekeeperReport['decision'] | null;
  readonly blocked_files: readonly string[];
  readonly blocked_count: number;
  readonly redacted_fields: readonly string[];
  readonly contains_secrets: false;
}

export interface GitExportJob extends ContractMetadata {
  readonly export_id: ContractId | string;
  readonly provider: GitExportProvider;
  readonly repo_name: string;
  readonly namespace: string;
  readonly visibility: GitRepositoryVisibility;
  readonly branch: string;
  readonly commit_message: string;
  readonly project_id: ProjectRecord['project_id'] | string;
  readonly status: GitExportStatus;
  readonly blockers: readonly GitExportBlocker[];
  readonly security_validation: GitExportSecurityValidation;
  readonly files_included: readonly GitExportFileEntry[];
  readonly repo_url?: string | null;
  readonly requested_at: TimestampISO | string;
  readonly completed_at?: TimestampISO | string | null;
  readonly failure_reason?: string | null;
}

export interface GitExportStatusResponse extends ContractMetadata {
  readonly export_id: ContractId | string;
  readonly status: GitExportStatus;
  readonly blockers: readonly GitExportBlocker[];
  readonly repo_url?: string | null;
  readonly security_validation: GitExportSecurityValidation;
  readonly files_included: readonly GitExportFileEntry[];
  readonly failure_reason?: string | null;
}
