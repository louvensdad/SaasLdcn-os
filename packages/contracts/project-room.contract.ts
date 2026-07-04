// Shared contract for the AI Project Room.
// Mirrors apps/api/app/schemas/project_room.py. No secret/API key is ever part of
// any response; chat content, spec and handoff are redacted server-side.

import type { ArchitectureBlueprint, StackProposal } from './architecture-blueprint.contract';
import type { ArchitectureModel } from './architecture-model.contract';

export type ProjectRoomStatus =
  | 'DRAFT'
  | 'UNDER_REVIEW'
  | 'PROMPT_READY'
  | 'PROMPT_APPROVED'
  | 'BLUEPRINT_GENERATING'
  | 'BLUEPRINT_READY'
  | 'ENGINEERING_REVIEW'
  | 'ENGINEERING_APPROVED'
  | 'WAITING_META_FACTORY'
  | 'META_FACTORY_RUNNING'
  | 'GENERATING'
  | 'VALIDATING'
  | 'READY'
  | 'FAILED'
  | 'ARCHIVED';

// Decided at room creation, before PromptMaster generation begins (LDCN OS spec
// section 7, step 1). "full_stack" means web + mobile together; "backend" means
// an API-only delivery with no UI at all (web or mobile).
export type DeliveryType = 'web' | 'backend' | 'mobile' | 'full_stack';

// Backend language the USER picked at room creation ('' = auto: the orchestrator
// suggests one). Values mirror the backend language-specialist profile ids —
// the pipeline enforces this choice onto every compiled spec.
export type PreferredLanguage =
  | ''
  | 'python'
  | 'typescript'
  | 'java'
  | 'csharp'
  | 'go'
  | 'rust'
  | 'php'
  | 'ruby'
  | 'kotlin';

export type ProjectRoomMessageRole = 'user' | 'assistant' | 'system';
export type ReadinessStatus = 'passed' | 'failed' | 'pending';
export type OperationStatus = 'pending' | 'running' | 'success' | 'failed' | 'rollback';

export interface ProjectRoomMessage {
  id: string;
  role: ProjectRoomMessageRole;
  content: string;
  degraded: boolean;
  created_at: string;
}

export interface PromptMasterSectionRef {
  id: string;
  title: string;
}

export interface PromptMasterVersion {
  version: number;
  markdown: string;
  sections: PromptMasterSectionRef[];
  generated_at: string;
  degraded: boolean;
  project_name?: string | null;
}

export interface GenerationJob {
  handoff_id: string;
  status: string;
  project_id: string;
  workspace_id?: string | null;
  prompt_master_version: number;
  project_name?: string | null;
  generated_project_id?: string | null;
  message: string;
  created_at: string;
}

export interface ProjectReadinessCheck {
  id: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
  required: boolean;
}

export interface ProjectRoomWorkflow {
  status: ProjectRoomStatus;
  status_label: string;
  progress: number;
  primary_action?: string | null;
  can_send_to_meta_factory: boolean;
  blocking_reasons: string[];
  expected_next_statuses: ProjectRoomStatus[];
}

export interface ProjectRoomHistoryEvent {
  id: string;
  event: string;
  actor: string;
  source: string;
  created_at: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface ProjectRoomOperationLog {
  id: string;
  timestamp: string;
  method?: string | null;
  endpoint?: string | null;
  http_status?: number | null;
  status: OperationStatus;
  message: string;
  detail?: string | null;
}

export interface BlueprintVersion {
  id: string;
  version: number;
  blueprint: ArchitectureBlueprint;
  provider: string | null;
  providerLabel: string;
  model?: string | null;
  generated_at: string;
  generation_time_ms: number;
  tokens: Record<string, number>;
  user: string;
  score: number;
  hash: string;
  prompt: string;
  base_version?: number | null;
  metadata: Record<string, unknown>;
}

export interface ProjectRoomFailureDiagnostic {
  status_current: string;
  status_expected: string[];
  endpoint_called: string;
  http_status: number;
  backend_message: string;
  rejection_reason: string;
  correction: string;
  checks: ProjectReadinessCheck[];
}

export type ReviewScoreStatus = 'scored' | 'unavailable';

export interface ReviewScoreCategory {
  key: string;
  label: string;
  status: ReviewScoreStatus;
  score?: number | null; // 0..100 when scored; null when unavailable
  basis: string;
}

export interface ReviewScore {
  overall?: number | null;
  categories: ReviewScoreCategory[];
}

export interface EngineeringReviewFinding {
  title: string;
  detail: string;
  area?: string | null;
}

export type CommitteeVerdict = 'approved' | 'approved_with_caveats' | 'changes_requested';

export interface CommitteeMember {
  role: string;
  rating: number; // 0..5
  verdict: CommitteeVerdict;
  rationale: string;
  signals: string[];
}

export interface ReviewDimension {
  key: string;
  label: string;
  status: ReviewScoreStatus; // 'scored' | 'unavailable'
  score?: number | null;
  verdict: string;
  findings: string[];
}

export interface FinalOpinion {
  deterministic: boolean;
  success_probability?: number | null; // 0..100, null when not derivable
  complexity: string; // band: Baixa | Média | Alta
  risk: string;
  scalability: string;
  narrative: string;
  disclaimer: string;
}

export interface EngineeringReviewAssessment {
  good_decisions: EngineeringReviewFinding[];
  debatable_decisions: EngineeringReviewFinding[];
  risks: EngineeringReviewFinding[];
  gaps: EngineeringReviewFinding[];
  inconsistencies: EngineeringReviewFinding[];
  scalability_impact: string;
  security_impact: string;
  generation_readiness: string;
  recommendations: string[];
  score?: ReviewScore | null;
  committee?: CommitteeMember[];
  dimensions?: ReviewDimension[];
  final_opinion?: FinalOpinion | null;
}

export interface ProjectRoomClarifyingQuestion {
  id: string;
  question: string;
  why_it_matters: string;
  default_if_skipped: string;
}

export interface ProjectRoomSpec {
  raw_intent: string;
  product_summary: string;
  target_users: string[];
  business_rules: string[];
  entities: string[];
  core_workflows: string[];
  non_functional: Record<string, string>;
  suggested_stack: Record<string, string>;
  delivery_type: DeliveryType;
  mobile_stack?: 'react_native_expo' | 'flutter' | null;
  locale: string;
  assumptions: { field: string; assumed_value: string; reason: string }[];
  open_questions: ProjectRoomClarifyingQuestion[];
  confidence: number;
}

export interface ProjectRoom {
  room_id: string;
  workspace_id?: string | null;
  title: string;
  status: ProjectRoomStatus;
  delivery_type: DeliveryType;
  preferred_language?: PreferredLanguage;
  raw_intent: string;
  locale: string;
  confidence: number;
  degraded: boolean;
  spec: ProjectRoomSpec | null;
  open_questions: ProjectRoomClarifyingQuestion[];
  messages: ProjectRoomMessage[];
  prompt_master_md: string | null;
  prompt_master_versions: PromptMasterVersion[];
  architecture_blueprint: ArchitectureBlueprint | null;
  blueprint_versions: BlueprintVersion[];
  active_blueprint_version?: number | null;
  // Stack Approval Gate: proposed stack (choice + reason + alternatives) and
  // its approval state, derived from the active blueprint.
  stack_proposal?: StackProposal | null;
  generation_handoff: GenerationJob | null;
  readiness_checklist: ProjectReadinessCheck[];
  engineering_review?: EngineeringReviewAssessment | null;
  architecture_model?: ArchitectureModel | null;
  workflow: ProjectRoomWorkflow | null;
  history: ProjectRoomHistoryEvent[];
  operational_log: ProjectRoomOperationLog[];
  last_failure: ProjectRoomFailureDiagnostic | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectRoomSummary {
  room_id: string;
  title: string;
  status: ProjectRoomStatus;
  delivery_type: DeliveryType;
  preferred_language?: PreferredLanguage;
  locale: string;
  degraded: boolean;
  has_prompt_master: boolean;
  updated_at: string;
  created_at: string;
}

export interface CreateProjectRoomRequest {
  title: string;
  raw_intent?: string;
  locale?: string;
  workspace_id?: string | null;
  delivery_type?: DeliveryType;
  preferred_language?: PreferredLanguage;
  user_model_choice?: string | null;
  use_user_key?: boolean;
}

export interface PostProjectRoomMessageRequest {
  content: string;
  user_model_choice?: string | null;
  use_user_key?: boolean;
}

export interface ReviseProjectRoomPromptRequest {
  adjustment: string;
  user_model_choice?: string | null;
  use_user_key?: boolean;
}

export type ImportPromptMasterFormat = 'markdown' | 'text' | 'json';

export interface ImportPromptMasterRequest {
  format: ImportPromptMasterFormat;
  content: string;
  title?: string;
  locale?: string;
  user_model_choice?: string | null;
  use_user_key?: boolean;
}
