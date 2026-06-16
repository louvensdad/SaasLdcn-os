// Shared contract for the brownfield modernization feature (PASSO 3).
// Mirrors apps/api/app/schemas/modernize.py.

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

export interface ModernizeResponse {
  inventory: CodebaseInventory;
  diagnosis: Diagnosis;
  plan: MigrationPlan;
}

export interface ModernizeGenerateResponse {
  ok: boolean;
  project_id: string | null;
  file_count: number;
  written: boolean;
  degraded: boolean;
  errors: string[];
}
