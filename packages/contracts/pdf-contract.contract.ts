import type { ContractId, ContractMetadata, ProjectId, TimestampISO } from './shared.contract';

export type ContractUploadStatus = 'uploaded' | 'rejected' | 'text_extracted' | 'analysis_ready' | 'failed';
export type ContractAnalysisStatus = 'pending' | 'completed' | 'blocked' | 'failed';
export type ContractRequirementCategory =
  | 'business_rules'
  | 'deliverables'
  | 'constraints'
  | 'deadlines'
  | 'compliance'
  | 'payment_terms'
  | 'scope_exclusions'
  | 'risks'
  | 'project_requirements';

export interface PdfContractUploadPolicy extends ContractMetadata {
  readonly max_size_bytes: number;
  readonly allowed_mime_types: readonly ['application/pdf'];
  readonly embedded_text_only: true;
  readonly ocr_enabled: false;
  readonly path_traversal_allowed: false;
}

export interface PdfContractUploadResponse extends ContractMetadata {
  readonly contract_id: ContractId | string;
  readonly project_id?: ProjectId | string | null;
  readonly original_file_name: string;
  readonly stored_file_name: string;
  readonly size_bytes: number;
  readonly mime_type: 'application/pdf';
  readonly status: ContractUploadStatus;
  readonly uploaded_at: TimestampISO | string;
  readonly extracted_text_available: boolean;
  readonly rejected_reason?: string | null;
}

export interface PdfContractAnalyzeRequest {
  readonly contract_id: ContractId | string;
  readonly project_id?: ProjectId | string | null;
}

export interface ContractRequirementItem {
  readonly id: string;
  readonly category: ContractRequirementCategory;
  readonly title: string;
  readonly summary: string;
  readonly source_page?: number | null;
  readonly confidence: 'low' | 'medium' | 'high';
}

export interface ContractUnderstandingReport extends ContractMetadata {
  readonly contract_id: ContractId | string;
  readonly project_id?: ProjectId | string | null;
  readonly status: ContractAnalysisStatus;
  readonly contract_summary: string;
  readonly business_rules: readonly ContractRequirementItem[];
  readonly deliverables: readonly ContractRequirementItem[];
  readonly requirements_extracted: readonly ContractRequirementItem[];
  readonly requirements: readonly ContractRequirementItem[];
  readonly risks: readonly ContractRequirementItem[];
  readonly constraints: readonly ContractRequirementItem[];
  readonly blueprint_suggestions: readonly string[];
  readonly prompt_master_context: {
    readonly allowed: true;
    readonly auto_generate_project: false;
    readonly context_summary: string;
    readonly redacted_fields: readonly string[];
    readonly contains_sensitive_content: boolean;
  };
  readonly generated_at: TimestampISO | string;
}

export interface ContractContextLink extends ContractMetadata {
  readonly project_id: ProjectId | string;
  readonly contract_id: ContractId | string;
  readonly report_id: ContractId | string;
  readonly context_enabled: boolean;
  readonly auto_generation_enabled: false;
}
