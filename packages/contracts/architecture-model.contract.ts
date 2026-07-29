// Shared contract for the deterministic ArchitectureModel (structured views).
// Mirrors apps/api/app/schemas/architecture_model.py. Every field is derived from
// real spec/blueprint data; empty/`available:false` means "no evidence", never invented.

export interface FlowNode {
  id: string;
  label: string;
  kind: string; // actor | layer | store | external | node
}

export interface FlowEdge {
  from_id: string;
  to_id: string;
  label: string;
}

export interface ContextDiagram {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface BoundedContext {
  name: string;
  responsibility: string;
  entities: string[];
  relationships: string[];
  evidence: string;
}

export interface FlowStep {
  step: string;
  detail: string;
}

export interface ModuleDependency {
  module: string;
  depends_on: string[];
}

export interface Strategy {
  available: boolean;
  summary: string;
  items: string[];
}

export interface DisasterRecovery {
  available: boolean;
  backup: string;
  restore: string;
  rto: string;
  rpo: string;
  replication: string;
}

export interface ArchitectureModel {
  deterministic: boolean;
  context_diagram: ContextDiagram;
  bounded_contexts: BoundedContext[];
  data_flow: FlowStep[];
  auth_flow: FlowStep[];
  dependencies: ModuleDependency[];
  events: Strategy;
  cache_strategy: Strategy;
  deploy_strategy: Strategy;
  disaster_recovery: DisasterRecovery;
}
