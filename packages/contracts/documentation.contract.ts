import type { ContractMetadata } from './shared.contract';

export type DocumentationDocCategory =
  | 'overview'
  | 'architecture'
  | 'api'
  | 'database'
  | 'security'
  | 'testing'
  | 'deployment'
  | 'contract'
  | 'quality'
  | 'adr';

export type DocumentationDocStatus =
  | 'missing'
  | 'draft'
  | 'generated'
  | 'validated'
  | 'inconsistent'
  | 'unsafe'
  | 'exported';

export type DocumentationCheckStatus = 'passed' | 'failed' | 'warning';
export type DocumentationCheckCategory = 'completeness' | 'consistency' | 'security' | 'quality';
export type DocumentationFindingSeverity = 'warning' | 'high' | 'critical';

export interface DocumentationFinding extends ContractMetadata {
  readonly code: string;
  readonly severity: DocumentationFindingSeverity;
  readonly category: DocumentationCheckCategory;
  readonly message: string;
  readonly path?: string | null;
}

export interface DocumentationDoc extends ContractMetadata {
  readonly id: string;
  readonly title: string;
  readonly category: DocumentationDocCategory;
  readonly required: boolean;
  readonly present: boolean;
  readonly status: DocumentationDocStatus;
  readonly exported: boolean;
  readonly path?: string | null;
  readonly size_bytes: number;
  readonly issues: readonly string[];
}

export interface DocumentationCheck extends ContractMetadata {
  readonly id: DocumentationCheckCategory;
  readonly label: string;
  readonly status: DocumentationCheckStatus;
  readonly message: string;
}

export interface DocumentationLibraryResponse extends ContractMetadata {
  readonly project_id: string;
  readonly project_name: string;
  readonly generated_project_path?: string | null;
  readonly score: number;
  readonly safe: boolean;
  readonly docs: readonly DocumentationDoc[];
  readonly checks: readonly DocumentationCheck[];
  readonly findings: readonly DocumentationFinding[];
  readonly missing_required: readonly string[];
  readonly present_count: number;
  readonly required_count: number;
  readonly generated_at: string;
}

export type DocumentationGenerationMode = 'llm' | 'deterministic';

export interface GeneratedDoc extends ContractMetadata {
  readonly id: string;
  readonly title: string;
  readonly path: string;
  readonly category: string;
  readonly content: string;
  readonly mode: DocumentationGenerationMode;
  readonly safe: boolean;
  readonly issues: readonly string[];
  readonly sources: readonly string[];
}

export interface DocumentationGenerateRequest {
  readonly doc_ids?: readonly string[] | null;
  readonly use_user_key?: boolean;
  readonly user_model_choice?: string | null;
}

export interface DocumentationGenerateResponse extends ContractMetadata {
  readonly project_id: string;
  readonly ai_active: boolean;
  readonly mode: 'ai' | 'deterministic';
  readonly docs: readonly GeneratedDoc[];
}

export interface DocumentationSaveItem {
  readonly id: string;
  readonly content: string;
}

export interface DocumentationSaveRequest {
  readonly docs: readonly DocumentationSaveItem[];
  readonly overwrite?: boolean;
}

export interface DocumentationSaveResult extends ContractMetadata {
  readonly id: string;
  readonly path: string;
  readonly written: boolean;
  readonly skipped: boolean;
  readonly blocked: boolean;
  readonly reason?: string | null;
}

export interface DocumentationSaveResponse extends ContractMetadata {
  readonly project_id: string;
  readonly saved: readonly DocumentationSaveResult[];
  readonly score: number;
  readonly blocked: boolean;
}

export interface DocumentationExportResponse extends ContractMetadata {
  readonly project_id: string;
  readonly exported: boolean;
  readonly blocked: boolean;
  readonly organized: boolean;
  readonly reason?: string | null;
  readonly docs_dir?: string | null;
  readonly exported_paths: readonly string[];
  readonly score: number;
}
