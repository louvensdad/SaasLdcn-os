// Mirrors apps/api/app/schemas/execution_profile.py. Economy / Professional /
// Enterprise: a room-level USER decision made at creation time (never inferred
// by the LLM) that controls cost/speed/depth of the generation pipeline
// without ever changing the minimum quality guarantee (compiling, QA'd,
// certified project) every profile must deliver.

export type ExecutionProfileId = 'economy' | 'professional' | 'enterprise';
export type ModelStrategy = 'economy' | 'balanced' | 'premium';

export interface ExecutionProfile {
  id: ExecutionProfileId;
  name: string;
  description: string;
  model_strategy: ModelStrategy;
  max_repair_cycles: number;
  enable_architecture_review: boolean;
  enable_security_review: boolean;
  enable_performance_review: boolean;
  enable_import_graph: boolean;
  enable_dependency_graph: boolean;
  enable_build_guarantee: boolean;
  enable_product_certification: boolean;
  enable_accessibility_review: boolean;
  enable_runtime_validation: boolean;
  enable_cost_optimization: boolean;
  enable_deep_project_planning: boolean;
  recommended: boolean;
}

// Shape returned by GET /execution-profiles (the list endpoint) -- only what
// the creation-step picker needs, not the full internal flag set.
export interface ExecutionProfileSummary {
  id: ExecutionProfileId;
  name: string;
  description: string;
  recommended: boolean;
}
