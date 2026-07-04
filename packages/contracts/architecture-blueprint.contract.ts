// Shared contract for the Architect Engine output.
// Mirrors apps/api/app/schemas/architecture_blueprint.py.
// Distinct from the wizard's registry ProjectBlueprint (blueprint.contract.ts).

export type BlueprintArea =
  | 'frontend'
  | 'backend'
  | 'database'
  | 'auth'
  | 'authorization'
  | 'apis'
  | 'integrations'
  | 'observability'
  | 'tests'
  | 'deploy';

export interface BlueprintDecision {
  area: string;
  choice: string;
  justification: string;
  alternatives_considered: string[];
  // Deep engineering rationale. Optional/empty means "not stated" — never invented.
  tradeoffs?: string[];
  impact?: string;
  risks?: string[];
  when_to_reconsider?: string;
  dependencies?: string[];
  requirement_links?: string[];
  // Per-decision confidence (0..1) from real signal strength, with its basis.
  confidence?: number;
  confidence_basis?: string;
  context?: string;
  // Dimension impacts. cost_impact is a QUALITATIVE band, non-monetary.
  scalability_impact?: string;
  security_impact?: string;
  cost_impact?: string;
  maintainability_impact?: string;
  evidence?: string[];
}

// Stack Approval Gate: explicit user consent for the development stack.
// Generation only starts when status === 'APPROVED'; the approved selections
// (not the model's internal choice) are what generation uses.
export interface StackApproval {
  status: 'PENDING' | 'APPROVED';
  approved_by?: string | null;
  approved_at?: string | null;
  selected_frontend: string;
  selected_backend: string;
  selected_database: string;
  selected_language: string;
  selected_auth: string;
  selected_testing: string;
  selected_deploy_target: string;
}

export interface StackProposalItem {
  area: string;
  label: string;
  choice: string;
  reason: string;
  alternatives: string[];
}

export interface StackProposal {
  status: 'PENDING' | 'APPROVED';
  items: StackProposalItem[];
  approval?: StackApproval | null;
}

export interface StackApprovalRequest {
  selected_frontend?: string;
  selected_backend?: string;
  selected_database?: string;
  selected_language?: string;
  selected_auth?: string;
  selected_testing?: string;
  selected_deploy_target?: string;
}

export interface ArchitectureBlueprint {
  project_id: string;
  decisions: BlueprintDecision[];
  degraded: boolean; // true when no real LLM authored the blueprint
  generated_at: string;
  provider: string | null;
  providerLabel: string;
  mode: 'llm' | 'deterministic';
  model: string;
  source: 'llm' | 'deterministic';
  version: number;
  generatedAt: string;
  tokensUsed: number;
  latencyMs: number;
  generatedBy: string;
  llmMetadata: Record<string, string | number | boolean | null>;
  origin: string;
  confidence: number;
  llm_model?: string | null;
  generation_time_ms: number;
  tokens: Record<string, number>;
  fallback: boolean;
  // Set when the user consciously accepts a degraded preview to pass Engineering Review.
  preview_acknowledged?: boolean;
  // Resilient-pipeline diagnostics: what the provider returned and how it was
  // parsed/normalized/repaired (raw excerpt, extractor/normalizer used, partial
  // recovery reason, missing areas). Powers "Visualizar resposta da IA".
  responseDiagnostics?: BlueprintResponseDiagnostics | null;
  // Stack Approval Gate state; absent/PENDING blocks generation. Reset by design
  // whenever a new blueprint version is generated.
  stack_approval?: StackApproval | null;
}

export interface BlueprintResponseDiagnostics {
  extractor_used: string;
  normalizer_used: string;
  parser_used: string;
  decisions_found: number;
  areas_present: string[];
  areas_missing: string[];
  repaired_fields: string[];
  partial: boolean;
  recovered: boolean;
  reason: string;
  raw_excerpt: string;
  raw_record?: {
    provider?: string | null;
    model?: string | null;
    raw_excerpt?: string;
    raw_hash?: string;
    tokens?: Record<string, number>;
    latency_ms?: number;
  };
}
