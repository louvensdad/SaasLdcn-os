// Shared contract for the Mission Workspace generic mission engine.
// Mirrors apps/api/app/schemas/mission.py and app/registry/missions_registry.py.
//
// software.build is the only bespoke-journey mission type in this MVP: its
// MissionInstance is a thin pointer (status BRIDGED + linked_project_room_id)
// into the existing ProjectRoom contract (project-room.contract.ts), which
// owns all of its real state from creation onward.

export type MissionCategory = 'criar' | 'analisar' | 'corrigir' | 'evoluir' | 'planejar' | 'pesquisar_decidir';

export type MissionStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ABANDONED' | 'BRIDGED';

// Autonomous/Learning modes are Fase 4 of the spec -- not exposed in this MVP.
export type ExecutionMode = 'guided' | 'fast' | 'expert' | 'analysis' | 'collaborative';

export type MissionMessageRole = 'user' | 'assistant' | 'system';
export type GapSeverity = 'critical' | 'high' | 'medium' | 'low';
export type GapAction = 'add_step' | 'dismiss' | 'backlog';
export type DecisionSource = 'user' | 'ai_accepted' | 'ai_modified';
export type MissionOperationStatus = 'pending' | 'running' | 'success' | 'failed' | 'rollback';

export interface MissionStepTopic {
  id: string;
  title: string;
  description: string;
}

export interface MissionGenome {
  id: string;
  category: MissionCategory;
  title: string;
  description: string;
  specialists: string[];
  artifact_types: string[];
  input_types: string[];
  has_bespoke_journey: boolean;
  generic_steps: MissionStepTopic[];
}

export interface MissionStepNote {
  step_id: string;
  key_points: string[];
  open_questions: string[];
  decisions_suggested: string[];
}

export interface MissionMessage {
  id: string;
  role: MissionMessageRole;
  content: string;
  degraded: boolean;
  created_at: string;
}

export interface Decision {
  id: string;
  step_id: string;
  field_id?: string | null;
  value: unknown;
  source: DecisionSource;
  reason?: string | null;
  created_at: string;
}

export interface MissionGap {
  id: string;
  severity: GapSeverity;
  category: string;
  title: string;
  description: string;
  suggested_action: string;
  auto_detected: boolean;
  dismissed: boolean;
  dismiss_reason?: string | null;
}

export interface MissionArtifact {
  type: string;
  format: 'markdown';
  content: string;
  generated_at: string;
  can_feed_mission: string[];
}

export interface MissionHistoryEvent {
  id: string;
  event: string;
  actor: string;
  source: string;
  created_at: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface MissionOperationLog {
  id: string;
  timestamp: string;
  method?: string | null;
  endpoint?: string | null;
  http_status?: number | null;
  status: MissionOperationStatus;
  message: string;
  detail?: string | null;
}

export interface MissionFailureDiagnostic {
  status_current: string;
  status_expected: string[];
  endpoint_called: string;
  http_status: number;
  backend_message: string;
  rejection_reason: string;
  correction: string;
}

export interface MissionInstance {
  mission_id: string;
  workspace_id?: string | null;
  mission_type: string;
  title: string;
  status: MissionStatus;
  mode: ExecutionMode;
  linked_project_room_id?: string | null;
  raw_intent: string;
  locale: string;
  degraded: boolean;
  current_step_id?: string | null;
  steps: MissionStepTopic[];
  step_notes: MissionStepNote[];
  messages: MissionMessage[];
  decisions: Decision[];
  gaps: MissionGap[];
  artifacts: MissionArtifact[];
  history: MissionHistoryEvent[];
  operational_log: MissionOperationLog[];
  last_failure: MissionFailureDiagnostic | null;
  created_at: string;
  updated_at: string;
}

export interface MissionInstanceSummary {
  mission_id: string;
  workspace_id?: string | null;
  mission_type: string;
  title: string;
  status: MissionStatus;
  linked_project_room_id?: string | null;
  degraded: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateMissionRequest {
  mission_type: string;
  title?: string;
  raw_intent?: string;
  locale?: string;
  workspace_id?: string | null;
  mode?: ExecutionMode;
  user_model_choice?: string | null;
  use_user_key?: boolean;
}

export interface PostMissionMessageRequest {
  content: string;
  user_model_choice?: string | null;
  use_user_key?: boolean;
}

export interface DecideGapRequest {
  action: GapAction;
  reason?: string | null;
}

export interface GenerateMissionArtifactRequest {
  user_model_choice?: string | null;
  use_user_key?: boolean;
}
