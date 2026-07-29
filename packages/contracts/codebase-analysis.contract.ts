// Shared contract for the deep codebase analysis.
// Mirrors apps/api/app/schemas/modernize.py.

export type IssueSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface CodebaseScores {
  architecture: number;
  security: number;
  backend: number;
  frontend: number;
  database: number;
  tests: number;
  devops: number;
  maintainability: number;
  performance: number;
  production_readiness: number;
  overall: number;
}

export interface CodeIssue {
  id: string;
  title: string;
  severity: IssueSeverity;
  category: string;
  file?: string | null;
  line?: number | null;
  root_cause: string;
  recommendation: string;
  auto_fixable: boolean;
}

export interface ExecutiveReport {
  health: string;
  risk_level: RiskLevel;
  top_problems: string[];
  business_impact: string;
  effort_estimate: string;
  priority: string;
}

export interface TechnicalReport {
  issues: CodeIssue[];
}

export interface CodebaseAnalysisReport {
  project_id: string;
  detected_stack: string;
  primary_language: string;
  scores: CodebaseScores;
  executive: ExecutiveReport;
  technical: TechnicalReport;
  degraded: boolean; // true when no real LLM enriched the analysis
  generated_at: string;
}
