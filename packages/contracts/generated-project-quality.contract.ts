import type { ContractMetadata } from './shared.contract';

export type GeneratedProjectQualityStatus = 'passed' | 'failed' | 'warning';
export type GeneratedProjectQualityCategory = 'structure' | 'manifest' | 'security' | 'readme' | 'env' | 'blueprint' | 'zip';
export type GeneratedProjectSecuritySeverity = 'warning' | 'high' | 'critical';

export interface GeneratedProjectQualityCheck extends ContractMetadata {
  readonly id: string;
  readonly label: string;
  readonly category: GeneratedProjectQualityCategory;
  readonly status: GeneratedProjectQualityStatus;
  readonly required: boolean;
  readonly message: string;
  readonly paths: readonly string[];
}

export interface GeneratedProjectSecurityFinding extends ContractMetadata {
  readonly code: string;
  readonly severity: GeneratedProjectSecuritySeverity;
  readonly message: string;
  readonly path?: string | null;
}

export interface GeneratedProjectQualityResponse extends ContractMetadata {
  readonly project_id: string;
  readonly framework: string;
  readonly template_id?: string | null;
  readonly profile_id?: string | null;
  readonly passed: boolean;
  readonly failed: boolean;
  readonly score: number;
  readonly checks: readonly GeneratedProjectQualityCheck[];
  readonly warnings: readonly string[];
  readonly missing_files: readonly string[];
  readonly security_findings: readonly GeneratedProjectSecurityFinding[];
}
