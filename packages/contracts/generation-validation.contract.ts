import type { ContractMetadata } from './shared.contract';
import type { GeneratedProjectQualityResponse } from './generated-project-quality.contract';

export type DependencyFindingStatus = 'missing' | 'outdated' | 'current' | 'managed' | 'skipped';
export type BuildStageStatus = 'passed' | 'failed' | 'skipped';

export interface DependencyFinding {
  readonly ecosystem: 'pypi' | 'npm' | 'maven';
  readonly name: string;
  readonly requested_version?: string | null;
  readonly latest_version?: string | null;
  readonly status: DependencyFindingStatus;
  readonly message: string;
  readonly manifest_path: string;
}

export interface DependencyAuditReport {
  readonly status: 'passed' | 'failed' | 'skipped';
  readonly skipped_reason?: string | null;
  readonly findings: readonly DependencyFinding[];
}

export interface BuildValidationReport {
  readonly installed: BuildStageStatus;
  readonly built: BuildStageStatus;
  readonly ok: boolean;
  readonly skipped_reason?: string | null;
  readonly logs_tail: string;
}

export interface GenerationValidationReport extends ContractMetadata {
  readonly project_id: string;
  readonly score: number;
  readonly passed: boolean;
  readonly quality: GeneratedProjectQualityResponse;
  readonly security_findings: readonly Record<string, unknown>[];
  readonly dependency_audit: DependencyAuditReport;
  readonly build: BuildValidationReport;
  readonly warnings: readonly string[];
}
