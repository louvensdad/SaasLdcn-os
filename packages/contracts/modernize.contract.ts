// Shared contract for the brownfield modernization feature (PASSO 3).
// Mirrors apps/api/app/schemas/modernize.py.

import type { GenerationValidationReport } from './generation-validation.contract';

export type IngestSource = 'zip' | 'git';
export type MigrationAction = 'migrate' | 'adapt' | 'encapsulate' | 'keep';
export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface IngestedFile {
  path: string;
  size_bytes: number;
  language: string;
}

export interface CodebaseInventory {
  ingest_id: string;
  source: IngestSource;
  file_count: number;
  total_bytes: number;
  skipped_count: number;
  languages: Record<string, number>;
  files: IngestedFile[];
}

export interface SecurityFinding {
  severity: Severity;
  code: string;
  message: string;
  path: string;
  line: number | null;
}

export interface ArchitectureSmell {
  code: string;
  message: string;
  related_paths: string[];
}

export interface Diagnosis {
  detected_stack: string;
  primary_language: string;
  languages: string[];
  dependency_notes: string[];
  smells: ArchitectureSmell[];
  security_findings: SecurityFinding[];
}

export interface MigrationMapping {
  legacy_path: string;
  target_path: string;
  action: MigrationAction;
  note: string;
}

export interface MigrationPlan {
  target_architecture: string;
  preserved_logic_note: string;
  steps: string[];
  mappings: MigrationMapping[];
}

export interface IngestStats {
  files_found: number;
  ignored_count: number;
  analyzable_count: number;
  total_bytes: number;
  lines_of_code: number;
  languages: Record<string, number>;
  frameworks: string[];
  complexity: string;
  truncated: boolean;
}

export interface ModernizeScoreMetric {
  id: string;
  label: string;
  value: number;
  basis: string;
}

export interface ModernizeFindingSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
  technical_debt: number;
  duplicated_code: number;
  dead_code: number;
  dependencies: number;
}

export interface ModernizeDetectedTechnology {
  name: string;
  category: string;
  confidence: number;
  evidence: string;
}

export interface ModernizeExecutiveSummary {
  overall_health: number;
  health_label: string;
  modernization_estimate: string;
  complexity: string;
  risk_level: 'low' | 'medium' | 'high';
  analysis_confidence: number;
  scores: ModernizeScoreMetric[];
  findings: ModernizeFindingSummary;
  technologies: ModernizeDetectedTechnology[];
  review: string;
  priority: string;
}

export interface ModernizeResponse {
  inventory: CodebaseInventory;
  diagnosis: Diagnosis;
  plan: MigrationPlan;
  stats?: IngestStats | null;
  executive_summary?: ModernizeExecutiveSummary | null;
}

export interface ModernizeGenerateResponse {
  ok: boolean;
  project_id: string | null;
  file_count: number;
  written: boolean;
  degraded: boolean;
  errors: string[];
  validation_report?: GenerationValidationReport | null;
}

// --- Modernize pipeline (deep analysis + approved auto-refactor) ---

import type { CodebaseScores } from './codebase-analysis.contract';
import type { LlmProviderConfig } from './llm-provider.contract';

export type {
  CodebaseAnalysisReport,
  CodebaseScores,
  CodeIssue,
} from './codebase-analysis.contract';
export type {
  ModernizationPlan,
  ModernizationPhase,
  FixAction,
  ApprovePlanRequest,
} from './refactor-plan.contract';
export type { LlmProviderConfig, LlmConnectionTestResult } from './llm-provider.contract';

export interface ModernizeProject {
  project_id: string;
  source: IngestSource;
  file_count: number;
  total_bytes: number;
  skipped_count: number;
  languages: Record<string, number>;
  created_at: string;
  stats?: IngestStats | null;
}

// Persistent-job ingest result: the full diagnosis bundle the cockpit renders
// PLUS the persistent project_id (== ingest_id) handed to Auto-Fix.
export interface ModernizeProjectIngest extends ModernizeResponse {
  project_id: string;
  source: IngestSource;
  created_at: string;
  file_count: number;
  total_bytes: number;
  skipped_count: number;
  languages: Record<string, number>;
}

// Lightweight card for picking up an existing analysis (latest / list).
export interface ModernizeProjectSummary {
  project_id: string;
  source: IngestSource;
  file_count: number;
  total_bytes: number;
  languages: Record<string, number>;
  created_at: string;
  updated_at: string;
  has_report: boolean;
  detected_stack?: string | null;
  overall_score?: number | null;
  findings_count?: number | null;
  scores?: CodebaseScores | null;
}

export interface RefactorResult {
  project_id: string;
  materialized_project_id: string;
  applied_count: number;
  failed_count: number;
  actions: string[];
  diff_summary: string[]; // paths only â€” never contents/secrets
}

export interface RevalidationReport {
  project_id: string;
  before: CodebaseScores;
  after: CodebaseScores;
  deltas: Record<string, number>;
  degraded: boolean;
}

export interface CodeDiffSummary {
  project_id: string;
  changed_paths: string[];
  score_deltas: Record<string, number>;
}

export interface ModernizeFlags {
  modernize_enabled: boolean;
  modernize_git_import: boolean;
  modernize_zip_upload: boolean;
  modernize_auto_refactor: boolean;
  modernize_user_llm_key: boolean;
  modernize_export: boolean;
}

export interface ModernizeConfigResponse {
  flags: ModernizeFlags;
  providers: LlmProviderConfig[];
}
