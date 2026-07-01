export type GenerationJobStatus =
  | 'QUEUED' | 'PREPARING_CONTEXT'
  | 'CONTRACTS_PLANNING' | 'CONTRACTS_GENERATING' | 'CONTRACTS_VALIDATING'
  | 'DATABASE_PLANNING' | 'DATABASE_GENERATING' | 'DATABASE_VALIDATING'
  | 'BACKEND_PLANNING' | 'BACKEND_GENERATING' | 'BACKEND_VALIDATING'
  | 'FRONTEND_PLANNING' | 'FRONTEND_GENERATING' | 'FRONTEND_VALIDATING'
  | 'SECURITY_PLANNING' | 'SECURITY_VALIDATING'
  | 'TESTS_GENERATING' | 'TESTS_RUNNING'
  | 'DOCUMENTATION_GENERATING' | 'BUILD_RUNNING' | 'PACKAGE_CREATING'
  | 'READY' | 'FAILED' | 'PAUSED' | 'NEEDS_USER_ACTION' | 'STALLED';

export type GenerationStageStatus = 'waiting' | 'running' | 'success' | 'failed' | 'skipped' | 'retrying' | 'stalled';

export interface GenerationArtifact {
  id: string;
  stage: string;
  name: string;
  kind: string;
  path: string;
  size_bytes: number;
  checksum: string;
  valid: boolean;
  warnings: string[];
  created_at: string;
}

export interface GenerationCheckpoint {
  id: string;
  stage: string;
  status: GenerationStageStatus;
  attempt: number;
  artifact_ids: string[];
  payload_bytes: number;
  estimated_tokens: number;
  parser?: string | null;
  validator?: string | null;
  partitioned: boolean;
  started_at: string;
  finished_at?: string | null;
  detail: string;
}

export interface GenerationJobLog {
  id: string;
  timestamp: string;
  stage: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  detail?: string | null;
}

export type ExecutionEventType =
  | 'stage_started' | 'stage_finished' | 'command_started' | 'command_output'
  | 'command_finished' | 'command_skipped' | 'artifact_written' | 'agent_started'
  | 'agent_finished' | 'error' | 'stalled' | 'timeout' | 'info';

// Fine-grained, real-time execution event for the live console.
export interface GenerationExecutionEvent {
  id: string;
  jobId: string;
  timestamp: string;
  stage: string;
  type: ExecutionEventType;
  level: 'info' | 'warning' | 'error';
  message: string;
  command?: string | null;
  cwd?: string | null;
  durationMs?: number | null;
  stream?: 'stdout' | 'stderr' | null;
  stdout?: string | null;
  stderr?: string | null;
  artifactPath?: string | null;
  exitCode?: number | null;
}

export interface GenerationJobError {
  stage: string;
  agent: string;
  provider?: string | null;
  model?: string | null;
  http_status?: number | null;
  payload_size: number;
  token_estimate: number;
  parser?: string | null;
  validator?: string | null;
  attempt: number;
  raw_response_path?: string | null;
  artifacts_preserved: string[];
  recommended_action: string;
  message: string;
  // Mandatory stall/failure diagnostic context.
  kind: 'failure' | 'stall';
  reason: string;
  elapsed_seconds: number;
  timeout_seconds?: number | null;
  last_log?: string | null;
  next_expected_transition?: string | null;
  warning_count: number;
  error_count: number;
  blocking_count: number;
  warning_breakdown: Record<string, number>;
  last_successful_checkpoint?: string | null;
  last_generated_artifact?: string | null;
  can_continue_with_warnings: boolean;
}

export interface ResilientGenerationJob {
  id: string;
  projectId: string;
  generatedProjectId?: string | null;
  workspaceId?: string | null;
  status: GenerationJobStatus;
  currentStage: string;
  provider?: string | null;
  providerLabel: string;
  model?: string | null;
  blueprintVersion: number;
  startedAt: string;
  finishedAt?: string | null;
  progress: number;
  error?: GenerationJobError | null;
  retryCount: number;
  artifacts: GenerationArtifact[];
  logs: GenerationJobLog[];
  events: GenerationExecutionEvent[];
  checkpoints: GenerationCheckpoint[];
  stageStatuses: Record<string, GenerationStageStatus>;
  projectName: string;
  partial: boolean;
  valid: boolean;
  packageReady: boolean;
  createdAt: string;
  updatedAt: string;
}
