/* Response shapes that packages/contracts does not declare yet, mirrored from the backend schemas they name. */

/** app/schemas/ldcn_assistant.py */
export type BriefingSource = 'room_status' | 'abstract_state' | 'work_estimate' | 'memory' | 'quality_gate';

export interface BriefingLine {
  readonly label: string;
  readonly value: string;
  readonly source: BriefingSource;
}

export interface NextMove {
  readonly action: string;
  readonly reason: string;
  readonly href: string;
  readonly blocked_by: string;
}

export interface AssistantBriefing {
  readonly scope: 'platform' | 'project';
  readonly project_id: string;
  readonly state: string;
  readonly headline: string;
  readonly readings: readonly BriefingLine[];
  readonly next_move: NextMove | null;
  readonly memory_count: number;
}

/** app/registry/missions_registry.py */
export type MissionCategory = 'create' | 'analyze' | 'fix' | 'evolve' | 'plan' | 'research';

export interface MissionSummary {
  readonly id: string;
  readonly category: MissionCategory;
  readonly title: string;
  readonly specialists: readonly string[];
}

/** app/schemas/activity_feed.py */
export interface ActivityEvent {
  readonly id: string;
  readonly category: string;
  readonly action: string;
  readonly status: string;
  readonly project_id: string | null;
  readonly occurred_at: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ActivityFeedResponse {
  readonly items: readonly ActivityEvent[];
  readonly next_cursor: string | null;
  readonly has_more: boolean;
}

/** GET /api/auth/policy */
export interface PolicyVersion {
  readonly version: string;
}

/** GET /api/project-rooms/{room_id}/abstract-state — the 12-bucket conceptual state beside the raw room status. */
export interface AbstractStateRead {
  readonly abstract_state: string | null;
  readonly room_status: string | null;
}

/** app/schemas/local_generation.py — what a prepared package says about itself before it is fetched. */
export interface PreparedDownload {
  readonly project_id: string;
  readonly status: 'prepared';
  readonly download_url: string;
  readonly zip_size_bytes: number;
  readonly file_count: number;
  readonly source_size_bytes: number;
  readonly security: { readonly status: string; readonly message?: string };
}

/** app/schemas/download.py */
export interface DownloadRecord {
  readonly downloadId: string;
  readonly projectId: string;
  readonly status: string;
  readonly artifactId: string;
  readonly checksumSha256: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly downloadedAt: string | null;
  readonly downloadUrl: string;
}

/** app/schemas/auto_repair.py — what a repair run reports back. */
export interface RepairResult {
  readonly project_id: string;
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
  readonly report: unknown;
}

/** GET /api/workforce/compositions — built by hand in the route, so it has no contract file. */
export interface CompositionCheck {
  readonly dimension: string;
  readonly status: string;
  readonly detail: string;
}

export interface CompositionRead {
  readonly id: string;
  readonly mode: 'integrated' | 'family';
  readonly verdict: string;
  readonly executed_at: string;
  readonly checks: readonly CompositionCheck[];
}

export interface CompositionsRead {
  readonly compositions: readonly CompositionRead[];
}

/** GET /api/test-room/profiles — the build profile catalogue, including what each profile cannot prove. */
export interface TestRoomProfileEntry {
  /** Canonical `language/framework@tool`. */
  readonly id: string;
  readonly language: string;
  readonly framework: string;
  readonly tool: string | null;
  readonly supportLevel: string;
  readonly limitations: readonly string[];
  readonly toolchain: readonly string[];
  readonly proves: {
    readonly proves_build: boolean;
    readonly proves_tests: boolean;
    readonly proves_runtime: boolean;
    readonly proves_health: boolean;
  };
}

export interface TestRoomProfilesRead {
  readonly profiles: readonly TestRoomProfileEntry[];
}

/**
 * GET /api/registry/stack-certifications — every executed CertificationSuite record, newest first per stack.
 * Component rows carry `sample_ref: certification_sample:…`; composition rows carry the composition id as
 * `profile_id` and the backend component's id as `stack_id`.
 */
export interface StackCertificationRecord {
  readonly id: string;
  readonly stack_id: string;
  readonly profile_id: string;
  readonly sample_ref: string;
  readonly checks: readonly { readonly dimension: string; readonly status: string; readonly detail?: string; readonly evidence_ref?: string }[];
  readonly environment?: string;
  readonly verdict: string;
  readonly executed_at: string;
  readonly executed_by?: string;
}

/** GET /api/workforce/cognitive-certifications — the latest run per role, with the axes it was measured on. */
export interface CognitiveAxis {
  readonly status: string;
  readonly depth: string;
  readonly model: string;
  readonly failedChecks: readonly string[];
}

export interface CognitiveRun {
  readonly runId: string;
  readonly roleId: string;
  readonly verdict: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly axes: Readonly<Record<string, CognitiveAxis>>;
}

export interface CognitiveCertificationsRead {
  readonly roles: readonly CognitiveRun[];
  readonly totalRuns: number;
}

/** GET /api/workforce/languages — each pack states its own status, derived from the ledger. */
export interface LanguagePacksRead {
  readonly languages: readonly Readonly<Record<string, unknown>>[];
}

/** POST /api/workforce/plan — composed by the route from the stack it is given, so it has no contract file. */
export interface PlannedPosition {
  readonly role_id: string;
  readonly reason: string;
  readonly mandatory: boolean;
  readonly required_competencies: readonly (readonly string[])[];
}

export interface PlannedAssignment {
  readonly role_id: string;
  readonly agent_version_ref: string | null;
  readonly risk_flag: string | null;
}

export interface PlannedGap {
  readonly competency: string;
  readonly required_depth: string;
  readonly best_available: string | null;
  readonly detail: string;
}

export interface PlannedComponent {
  readonly slot: string;
  readonly stack_id: string;
  readonly profile_id: string;
  readonly maturity: string;
  readonly health: string;
  readonly depends_on: readonly string[];
}

export interface PlannedComposition {
  readonly maturity: string;
  readonly composable: boolean;
  readonly build_order: readonly string[];
  readonly startup_order: readonly string[];
  readonly integration_contract: unknown;
  readonly gaps: readonly string[];
  readonly components: readonly PlannedComponent[];
}

export interface WorkforcePlanRead {
  readonly mission_ref: string;
  readonly status: string;
  readonly positions: readonly PlannedPosition[];
  readonly assignments: readonly PlannedAssignment[];
  readonly consultation_pool: readonly string[];
  readonly gaps: readonly PlannedGap[];
  readonly notes: readonly string[];
  readonly composition: PlannedComposition | null;
}

export interface WorkforcePlanRequest {
  readonly mission_ref: string;
  readonly components: readonly { readonly slot: string; readonly language: string; readonly framework: string; readonly version_constraint: string }[];
  readonly realtime: boolean;
  readonly auth: boolean;
  readonly sensitive_data: boolean;
  readonly multi_tenant: boolean;
  readonly criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

/** app/schemas/engineering_lab.py — the generated workspace as the lab reads it. */
export interface LabDependency {
  readonly name: string;
  readonly version?: string | null;
  readonly ecosystem?: string | null;
}

export interface EngineeringLabOverview {
  readonly project_id: string;
  readonly project_path: string;
  readonly project_name: string;
  readonly stack: string;
  readonly primary_language: string;
  readonly languages: Readonly<Record<string, number>>;
  readonly file_count: number;
  readonly line_count: number;
  readonly dependency_count: number;
  readonly dependencies: readonly LabDependency[];
  readonly containers: readonly string[];
  readonly databases: readonly string[];
  readonly cloud: readonly string[];
  readonly build: string;
  readonly coverage: string;
}

export interface TerminalChunk {
  readonly kind: string;
  readonly text: string;
}

export interface TerminalRun {
  readonly project_id: string;
  readonly command: string;
  readonly cwd: string;
  readonly exit_code: number;
  readonly duration_ms: number;
  readonly output: readonly TerminalChunk[];
  readonly allowed_command: boolean;
  readonly runtime_status?: string | null;
  readonly sandbox_id?: string | null;
}

/** app/schemas/modernize.py — the card for picking an existing analysis back up. */
export interface ModernizeProjectSummary {
  readonly project_id: string;
  readonly source: string;
  readonly file_count: number;
  readonly total_bytes: number;
  readonly languages: Readonly<Record<string, number>>;
  readonly created_at: string;
  readonly updated_at: string;
  readonly has_report: boolean;
  readonly detected_stack?: string | null;
  readonly overall_score?: number | null;
}

/** app/schemas/auth.py — one open session of this account. */
export interface AccountSession {
  readonly session_id: string;
  readonly ip_address?: string | null;
  readonly device_label?: string | null;
  readonly created_at: string;
  readonly last_seen_at: string;
  readonly is_current: boolean;
}

/** The enrolment secret is shown once, by the backend, so the person can store it in their authenticator. */
export interface TwoFactorEnrollment {
  readonly secret: string;
  readonly otpauth_uri: string;
}

/** GET /api/ai-status — whether the installation can call a model at all right now. */
export interface AiStatusRead {
  readonly available: boolean;
  readonly provider?: string | null;
  readonly model?: string | null;
  readonly reason?: string | null;
  readonly mode?: string | null;
}

/* --- Library (wave 6) ------------------------------------------------------
   Shapes the backend returns without a contract file of their own: the team
   memory surface (`routes/team_memory.py`) and the stack certification records
   (`routes/registry.py` -> `stack_certification_service.repository.list_all`). */

export interface TeamMemoryTeam {
  readonly team_id: string;
  readonly proposed: number;
  readonly approved: number;
}

export interface TeamMemoryTeamsRead {
  readonly teams: readonly TeamMemoryTeam[];
}

export interface TeamMemoryEntry {
  readonly id: string;
  readonly team_id: string;
  readonly category?: string | null;
  readonly content: string;
  readonly source: string;
  readonly status: string;
  readonly version: number;
  readonly confidence: number;
  readonly evidence_refs?: readonly string[];
  readonly subject?: string | null;
  readonly record_type?: string;
  readonly evidence_status?: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface TeamMemoryKnowledgeRead {
  readonly team_id: string;
  readonly knowledge: readonly TeamMemoryEntry[];
}

export interface TeamMemoryQueueRead {
  readonly team_id: string;
  readonly queue: readonly TeamMemoryEntry[];
}

export interface LearningTeamMetric {
  readonly team_id: string;
  readonly proposed: number;
  readonly approved: number;
  readonly deprecated: number;
  /** null when nothing has been decided yet -- no decisions is not a 0% rate. */
  readonly approval_rate: number | null;
}

export interface LearningRetrospective {
  readonly job_id: string;
  readonly finished_at?: string | null;
  readonly signals: number;
  readonly proposed_lessons: number;
  readonly recurring_lessons: number;
}

export interface LearningMetricsRead {
  readonly scopes: Readonly<Record<string, string>>;
  readonly team_memory: {
    readonly per_team: readonly LearningTeamMetric[];
    readonly totals: { readonly proposed: number; readonly approved: number; readonly deprecated: number; readonly approval_rate: number | null };
  };
  readonly retrospectives: {
    readonly observations: readonly LearningRetrospective[];
    readonly unavailable_count: number;
    readonly recurring_total: number;
    readonly note: string;
  };
}

/* --- Studio (wave 6) -------------------------------------------------------
   The Data Intelligence platform has no contract file; these mirror
   `app/schemas/analysis_session.py`, which serialises with camelCase aliases. */

export interface AnalysisSessionSummary {
  readonly id: string;
  readonly status: string;
  readonly currentStep: number;
  readonly objectiveText?: string | null;
  readonly executionMode: 'DETERMINISTIC_ONLY' | 'AI_ASSISTED';
  readonly archived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface JourneyStep {
  readonly stepIndex: number;
  readonly id: string;
  readonly label: string;
  readonly agent?: string | null;
  readonly status: string;
  readonly inputSummary?: string | null;
  readonly outputSummary?: string | null;
  readonly progressPercent?: number | null;
  readonly elapsedSeconds?: number | null;
  readonly evidence: readonly string[];
  readonly artifacts: readonly string[];
  readonly alerts: readonly string[];
  readonly pendingDecisions: readonly string[];
  readonly nextActions: readonly string[];
}

export interface SessionJobStatus {
  readonly jobId: string;
  readonly sessionId: string;
  readonly operation: string;
  readonly status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  readonly stage: string;
  readonly progress: number;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly elapsedSeconds: number;
  readonly currentAgent?: string | null;
  readonly message: string;
  readonly warningCount: number;
  readonly blockerCount: number;
  readonly recoverable: boolean;
  readonly recommendedAction: string;
}

export interface AnalysisSession extends AnalysisSessionSummary {
  readonly ownerUserId: string;
  readonly workspaceId?: string | null;
  readonly objectiveCategory?: string | null;
  readonly originalDatasetId?: string | null;
  readonly steps: readonly JourneyStep[];
  readonly error?: Readonly<Record<string, unknown>> | null;
  readonly runningJob?: SessionJobStatus | null;
  readonly attemptCount: number;
}

export interface DatasetRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly version: number;
  readonly isOriginal: boolean;
  readonly storageRef: string;
  readonly originalFilename?: string | null;
  readonly sourceFormat?: string | null;
  readonly bytesSize: number;
  readonly rowCountEstimate?: number | null;
  readonly producedByAgent?: string | null;
  readonly createdAt: string;
}

export interface AgentExecutionRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly stage: string;
  readonly status: string;
  readonly attempt: number;
  readonly executionMode: 'DETERMINISTIC_ONLY' | 'AI_ASSISTED';
  readonly usedAI: boolean;
  readonly provider?: string | null;
}

export interface GovernanceFlagRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly datasetId: string;
  readonly columnName: string;
  readonly piiType: string;
  readonly actionTaken: string;
  readonly createdAt: string;
}

export interface SourceTypeStatusEntry {
  readonly sourceType: string;
  readonly status: 'IMPLEMENTED' | 'PARTIAL' | 'PLANNED' | 'UNSUPPORTED';
  readonly note: string;
}

export interface MonitoringRuleRecord {
  readonly id: string;
  readonly sessionId?: string | null;
  readonly metric: string;
  readonly threshold: Readonly<Record<string, unknown>>;
  readonly schedule: string;
  readonly status: 'active' | 'paused';
  readonly lastRunAt?: string | null;
  readonly lastCheckedDatasetVersion?: number | null;
  readonly createdAt: string;
}

export interface MonitoringCheckRecord {
  readonly id: string;
  readonly ruleId: string;
  readonly datasetVersion: number;
  readonly observedValue?: number | null;
  readonly baselineValue: number;
  readonly deviationPercent?: number | null;
  readonly status: 'ok' | 'breach' | 'no_new_data';
  readonly createdAt: string;
}

/* --- Guided mission (wave 6) -----------------------------------------------
   `app/schemas/mission_deliverable_job.py`: the async job that drafts a
   mission's artifacts, and the handoff status the completion screen reads. */

export type MissionDeliverableJobStatus =
  | 'QUEUED' | 'ANSWERS_LOADING' | 'DRAFTING' | 'DRAFTS_READY'
  | 'PERSISTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface ArtifactProgress {
  readonly type: string;
  readonly title: string;
  readonly status: 'pending' | 'drafting' | 'ready' | 'failed';
  readonly provider?: string | null;
  readonly model?: string | null;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly started_at?: string | null;
  readonly finished_at?: string | null;
}

export interface MissionDeliverableJobErrorDetail {
  readonly kind: 'llm_error' | 'mission_not_found' | 'worker_lease_expired' | 'confirm_failed';
  readonly message: string;
  readonly artifact_type?: string | null;
}

export interface MissionDeliverableJob {
  readonly id: string;
  readonly mission_id: string;
  readonly status: MissionDeliverableJobStatus;
  readonly error?: MissionDeliverableJobErrorDetail | null;
  readonly artifacts_progress: readonly ArtifactProgress[];
  readonly degraded: boolean;
  /** The model the person picked at the LLM gate, before each artifact's own is known. */
  readonly requested_model?: string | null;
  readonly retry_count: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly completed_at?: string | null;
}

export interface MissionExecutionHandoffStatus {
  readonly handoff_id: string;
  readonly mission_id: string;
  readonly project_room_id?: string | null;
  readonly room_status?: string | null;
  readonly engineering_approved: boolean;
  readonly stack_approved: boolean;
  readonly generation_job_id?: string | null;
  /** A route of the CURRENT app; this app maps it rather than following it. */
  readonly next_route: string;
}
