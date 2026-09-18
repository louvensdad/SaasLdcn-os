import type { AuthResponse, UserLoginRequest, UserPublic, UserRegisterRequest } from '@contracts/auth.contract';
import type { ChangeRequestSummary } from '@contracts/change-request.contract';
import type { AiKeyListResponse, AiKeyView, TestKeyResponse } from '@contracts/ai-key-vault.contract';
import type { PlanView } from '@contracts/billing-catalog.contract';
import type { LlmDecisionTrace } from '@contracts/observability.contract';
import type { RoadmapResponse } from '@contracts/roadmap.contract';
import type { PlatformRuntimeConfig } from '@contracts/runtime-metrics.contract';
import type { SystemStatusResponse } from '@contracts/system-status.contract';
import type { SubscriptionView, TrialView } from '@contracts/billing-catalog.contract';
import type { EntitlementCheck, UsageSummary } from '@contracts/billing-usage.contract';
import type { ChangeRequest, ChangeRequestDiff } from '@contracts/change-request.contract';
import type { GitProviderConnection } from '@contracts/git-provider.contract';
import type { ConsoleLogEntry, LivePreviewSession } from '@contracts/live-preview.contract';
import type { SandboxPolicyException } from '@contracts/sandbox-policy.contract';
import type { ProfileMatch, TestRoomRun, TestRoomSessionView } from '@contracts/test-room.contract';
import type {
  AgentDetailView, AgentExecutionView, CertificationView, CompanyJobView, ExpansionRequestView,
  ImplementationPlanView, JobAssignment, RoleMapView, VirtualCompanyView,
} from '@contracts/company.contract';
import type { ChiefVerificationView } from '@contracts/company.contract';
import type { GeneratedProjectExportRequest, GeneratedProjectExportResponse } from '@contracts/generated-export.contract';
import type { TestRoomProof } from '@contracts/test-room.contract';
import type { DeliveryDecision, DeliveryMode } from '@contracts/delivery.contract';
import type { EngineeringKernelStatus } from '@contracts/engineering-kernel.contract';
import type { GenerationJobSummary, ResilientGenerationJob } from '@contracts/generation-job.contract';
import type { GenerationNotificationListResponse } from '@contracts/generation-notification.contract';
import type { Automation, AutomationRun } from '@contracts/automation.contract';
import type { CreateMissionRequest, MissionInstance } from '@contracts/mission.contract';
import type { GlossaryTerm } from '@contracts/language-model.contract';
import type { InfrastructureComponent } from '@contracts/infrastructure.contract';
import type { LanguageContract } from '@contracts/language.contract';
import type { MarketplaceInstall, MarketplaceItem } from '@contracts/marketplace.contract';
import type { SkillCatalogResponse } from '@contracts/skill.contract';
import type { StackContract } from '@contracts/stack.contract';
import type { TemplateCatalogResponse } from '@contracts/template.contract';
import type { ActiveLlmSettings, LlmModelUsage, LlmUsageStats } from '@contracts/llm-settings.contract';
import type { ProjectRecord } from '@contracts/project.contract';
import type { CreateProjectRoomRequest, ProjectRoom, ProjectRoomSummary } from '@contracts/project-room.contract';
import type { QualityGateReport } from '@contracts/quality-gate.contract';
import type { EvolutionInsight, Memory, WorkEstimate } from '@contracts/room-insights.contract';
import type { PresenceDecisionResponse } from '@contracts/system-presence.contract';
import type { Organization, Workspace, WorkspaceMember } from '@contracts/tenant.contract';
import type { UserPreferencesBlob } from '@contracts/user-preferences.contract';

import { apiBlob, apiFetch, LONG_TIMEOUT_MS, query } from './http';
import type {
  AccountSession, AiStatusRead, TwoFactorEnrollment,
  CognitiveCertificationsRead, CompositionsRead, StackCertificationRecord, TestRoomProfilesRead, DownloadRecord, EngineeringLabOverview, LanguagePacksRead,
  ModernizeProjectSummary, PreparedDownload, RepairResult, TerminalRun, WorkforcePlanRead, WorkforcePlanRequest,
} from './types';
import type { AbstractStateRead, ActivityFeedResponse, AssistantBriefing, MissionSummary, PolicyVersion } from './types';
import type { LearningMetricsRead, TeamMemoryKnowledgeRead, TeamMemoryQueueRead, TeamMemoryTeamsRead } from './types';
import type { MissionDeliverableJob, MissionExecutionHandoffStatus } from './types';
import type {
  AgentExecutionRecord, AnalysisSession, AnalysisSessionSummary, DatasetRecord,
  GovernanceFlagRecord, MonitoringCheckRecord, MonitoringRuleRecord, SourceTypeStatusEntry,
} from './types';

/** Every backend call this app makes, in one place, so each screen names its source. */
export const api = {
  policy: () => apiFetch<PolicyVersion>('/api/auth/policy', { refreshOn401: false }),
  login: (body: UserLoginRequest) => apiFetch<AuthResponse>('/api/auth/login', { method: 'POST', body, refreshOn401: false }),
  register: (body: UserRegisterRequest) => apiFetch<AuthResponse>('/api/auth/register', { method: 'POST', body, refreshOn401: false }),
  logout: () => apiFetch<null>('/api/auth/logout', { method: 'POST', refreshOn401: false }),
  me: () => apiFetch<UserPublic>('/api/auth/me'),

  workspaces: () => apiFetch<Workspace[]>('/api/workspaces'),
  organizations: () => apiFetch<Organization[]>('/api/organizations'),

  briefing: (projectId?: string) => apiFetch<AssistantBriefing>(`/api/ldcn/briefing${query({ project_id: projectId })}`),
  glossary: () => apiFetch<GlossaryTerm[]>('/api/language-model/glossary'),

  /* Library. Every read is a catalog the backend already publishes; nothing here is composed in the browser. */
  registryLanguages: () => apiFetch<LanguageContract[]>('/api/registry/languages'),
  registryStacks: () => apiFetch<StackContract[]>('/api/registry/stacks'),
  infrastructureComponents: () => apiFetch<InfrastructureComponent[]>('/api/infrastructure/components'),
  templateCatalog: () => apiFetch<TemplateCatalogResponse>('/api/templates/catalog'),
  skillCatalog: () => apiFetch<SkillCatalogResponse>('/api/skills'),
  teamMemoryTeams: () => apiFetch<TeamMemoryTeamsRead>('/api/team-memory/teams'),
  teamMemoryKnowledge: (teamId: string) => apiFetch<TeamMemoryKnowledgeRead>(`/api/team-memory/${encodeURIComponent(teamId)}/knowledge`),
  teamMemoryQueue: (teamId: string) => apiFetch<TeamMemoryQueueRead>(`/api/team-memory/${encodeURIComponent(teamId)}/queue`),
  learningMetrics: () => apiFetch<LearningMetricsRead>('/api/team-memory/metrics'),
  marketplaceItems: () => apiFetch<MarketplaceItem[]>('/api/marketplace/items'),
  marketplaceMine: () => apiFetch<MarketplaceItem[]>('/api/marketplace/items/mine'),
  marketplaceInstalls: () => apiFetch<MarketplaceInstall[]>('/api/marketplace/installs/mine'),

  /* Studio. Data Intelligence serialises with camelCase aliases; automations do not. */
  analysisSessions: () => apiFetch<AnalysisSessionSummary[]>('/api/data-intelligence/sessions'),
  analysisSession: (sessionId: string) => apiFetch<AnalysisSession>(`/api/data-intelligence/sessions/${encodeURIComponent(sessionId)}`),
  analysisDatasets: (sessionId: string) => apiFetch<DatasetRecord[]>(`/api/data-intelligence/sessions/${encodeURIComponent(sessionId)}/datasets`),
  analysisAgents: (sessionId: string) => apiFetch<AgentExecutionRecord[]>(`/api/data-intelligence/sessions/${encodeURIComponent(sessionId)}/agent-executions`),
  analysisGovernance: (sessionId: string) => apiFetch<GovernanceFlagRecord[]>(`/api/data-intelligence/sessions/${encodeURIComponent(sessionId)}/governance-flags`),
  analysisSourceTypes: () => apiFetch<SourceTypeStatusEntry[]>('/api/data-intelligence/source-types'),
  monitoringRules: () => apiFetch<MonitoringRuleRecord[]>('/api/data-intelligence/monitoring-rules'),
  monitoringChecks: (ruleId: string) => apiFetch<MonitoringCheckRecord[]>(`/api/data-intelligence/monitoring-rules/${encodeURIComponent(ruleId)}/checks`),
  automations: () => apiFetch<Automation[]>('/api/automations'),
  automationRuns: (automationId: string) => apiFetch<AutomationRun[]>(`/api/automations/${encodeURIComponent(automationId)}/runs`),

  /* Start and the guided mission. The two creates are the only writes that bring new work into being. */
  createRoom: (body: Partial<CreateProjectRoomRequest>) =>
    apiFetch<ProjectRoom>('/api/project-rooms', { method: 'POST', body, timeoutMs: LONG_TIMEOUT_MS }),
  createMission: (body: CreateMissionRequest) =>
    apiFetch<MissionInstance>('/api/missions', { method: 'POST', body, timeoutMs: LONG_TIMEOUT_MS }),
  mission: (missionId: string) => apiFetch<MissionInstance>(`/api/missions/${encodeURIComponent(missionId)}`),
  latestDeliverableJob: (missionId: string) =>
    apiFetch<MissionDeliverableJob | null>(`/api/missions/${encodeURIComponent(missionId)}/deliverables/jobs/latest`),
  retryDeliverableJob: (missionId: string, jobId: string) =>
    apiFetch<MissionDeliverableJob>(`/api/missions/${encodeURIComponent(missionId)}/deliverables/jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST' }),
  cancelDeliverableJob: (missionId: string, jobId: string) =>
    apiFetch<MissionDeliverableJob>(`/api/missions/${encodeURIComponent(missionId)}/deliverables/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' }),
  missionHandoff: (missionId: string) =>
    apiFetch<MissionExecutionHandoffStatus>(`/api/missions/${encodeURIComponent(missionId)}/execution-handoff`),
  missionRegistry: () => apiFetch<MissionSummary[]>('/api/missions/registry'),
  projectRooms: () => apiFetch<ProjectRoomSummary[]>('/api/project-rooms'),
  /** No `archived` parameter: the backend then returns every job, archived ones included. */
  jobs: () => apiFetch<GenerationJobSummary[]>('/api/meta-factory/jobs'),
  projects: () => apiFetch<ProjectRecord[]>('/api/projects'),
  changeRequests: () => apiFetch<ChangeRequestSummary[]>('/api/change-requests'),
  activity: (params: { readonly category?: string; readonly cursor?: string; readonly status?: string; readonly search?: string }) =>
    apiFetch<ActivityFeedResponse>(`/api/activity-feed${query(params)}`),
  notifications: (params: { readonly read?: boolean; readonly cursor?: string; readonly limit?: number } = {}) =>
    apiFetch<GenerationNotificationListResponse>(`/api/notifications${query(params)}`),
  markNotificationsRead: () => apiFetch<{ updated: number }>('/api/notifications/read-all', { method: 'POST' }),
  presenceDecisions: (params: { readonly limit?: number } = {}) =>
    apiFetch<PresenceDecisionResponse>(`/api/system/presence/decisions${query(params)}`),

  /* One project, across the identities the backend keeps for it (see NEXT-FRONTEND-ROUTE-MODEL.md §2):
     the room id is the key, the generated project id comes from the latest mission. */
  room: (roomId: string) => apiFetch<ProjectRoom>(`/api/project-rooms/${encodeURIComponent(roomId)}`),
  roomAbstractState: (roomId: string) => apiFetch<AbstractStateRead>(`/api/project-rooms/${encodeURIComponent(roomId)}/abstract-state`),
  roomEvolutionInsight: (roomId: string) => apiFetch<EvolutionInsight>(`/api/project-rooms/${encodeURIComponent(roomId)}/evolution-insight`),
  project: (projectId: string) => apiFetch<ProjectRecord>(`/api/projects/${encodeURIComponent(projectId)}`),
  job: (jobId: string) => apiFetch<ResilientGenerationJob>(`/api/meta-factory/jobs/${encodeURIComponent(jobId)}`),
  setJobArchived: (jobId: string, archived: boolean) =>
    apiFetch<ResilientGenerationJob>(`/api/meta-factory/jobs/${encodeURIComponent(jobId)}/archive`, { method: 'PATCH', body: { archived } }),
  deleteJob: (jobId: string) => apiFetch<null>(`/api/meta-factory/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' }),
  pauseJob: (jobId: string) => apiFetch<ResilientGenerationJob>(`/api/meta-factory/jobs/${encodeURIComponent(jobId)}/pause`, { method: 'POST' }),
  resumeJob: (jobId: string) => apiFetch<ResilientGenerationJob>(`/api/meta-factory/jobs/${encodeURIComponent(jobId)}/resume`, { method: 'POST' }),
  /* Mission controls. Each one is a state change the backend records; none of them is optimistic here. */
  retryStage: (jobId: string, stage: string, mode: 'normal' | 'partitioned' | 'deterministic') =>
    apiFetch<ResilientGenerationJob>(`/api/meta-factory/jobs/${encodeURIComponent(jobId)}/stages/${encodeURIComponent(stage)}/retry`, {
      method: 'POST', body: { mode }, timeoutMs: LONG_TIMEOUT_MS,
    }),
  approveRepair: (jobId: string) =>
    apiFetch<ResilientGenerationJob>(`/api/meta-factory/jobs/${encodeURIComponent(jobId)}/approve-repair`, { method: 'POST' }),
  continueWithWarnings: (jobId: string) =>
    apiFetch<ResilientGenerationJob>(`/api/meta-factory/jobs/${encodeURIComponent(jobId)}/continue`, { method: 'POST' }),
  continueAfterBuildSkip: (jobId: string) =>
    apiFetch<ResilientGenerationJob>(`/api/meta-factory/jobs/${encodeURIComponent(jobId)}/continue-after-build-skip`, { method: 'POST' }),
  diagnostic: (jobId: string) => apiFetch<unknown>(`/api/meta-factory/jobs/${encodeURIComponent(jobId)}/diagnostic`),

  /* These take the GENERATED project id, not the room id. */
  kernel: (generatedProjectId: string) =>
    apiFetch<EngineeringKernelStatus>(`/api/meta-factory/${encodeURIComponent(generatedProjectId)}/engineering-kernel`),
  qualityReport: (generatedProjectId: string) =>
    apiFetch<QualityGateReport>(`/api/meta-factory/${encodeURIComponent(generatedProjectId)}/quality-report`),
  deliveryDecision: (generatedProjectId: string) =>
    apiFetch<DeliveryDecision>(`/api/meta-factory/${encodeURIComponent(generatedProjectId)}/delivery`),
  chooseDelivery: (generatedProjectId: string, mode: DeliveryMode) =>
    apiFetch<DeliveryDecision>(`/api/meta-factory/${encodeURIComponent(generatedProjectId)}/delivery`, { method: 'POST', body: { delivery_mode: mode } }),

  llmActive: () => apiFetch<ActiveLlmSettings>('/api/llm/settings/active'),
  llmUsage: () => apiFetch<LlmUsageStats>('/api/llm/usage/stats'),

  /* Evidence: every verdict comes from its own endpoint, and an absent verdict is never read as approval. */
  chief: (jobId: string) => apiFetch<ChiefVerificationView | null>(`/api/companies/by-job/${encodeURIComponent(jobId)}/chief`),
  testRoomProof: (generatedProjectId: string) => apiFetch<TestRoomProof>(`/api/test-room/${encodeURIComponent(generatedProjectId)}/proof`),
  validateProject: (generatedProjectId: string) =>
    apiFetch<QualityGateReport>(`/api/meta-factory/${encodeURIComponent(generatedProjectId)}/validate`, { method: 'POST', timeoutMs: LONG_TIMEOUT_MS }),
  revalidateProject: (generatedProjectId: string) =>
    apiFetch<QualityGateReport>(`/api/meta-factory/${encodeURIComponent(generatedProjectId)}/revalidate`, { method: 'POST', timeoutMs: LONG_TIMEOUT_MS }),
  repairProject: (generatedProjectId: string) =>
    apiFetch<RepairResult>(`/api/meta-factory/${encodeURIComponent(generatedProjectId)}/repair`, { method: 'POST', timeoutMs: LONG_TIMEOUT_MS }),
  repairProjectWithAi: (generatedProjectId: string) =>
    apiFetch<RepairResult>(`/api/meta-factory/${encodeURIComponent(generatedProjectId)}/repair/llm`, { method: 'POST', timeoutMs: LONG_TIMEOUT_MS }),
  /** The backend compares the phrase exactly, and the phrase itself is Portuguese in every locale. */
  acknowledgeHumanReview: (generatedProjectId: string, confirmation: string) =>
    apiFetch<EngineeringKernelStatus>(`/api/meta-factory/${encodeURIComponent(generatedProjectId)}/acknowledge-human-review`, { method: 'POST', body: { confirmation } }),
  forceRelease: (generatedProjectId: string, confirmation: string) =>
    apiFetch<QualityGateReport>(`/api/meta-factory/${encodeURIComponent(generatedProjectId)}/force-release`, { method: 'POST', body: { confirmation } }),

  /* Delivery: the package, the Git export and what was downloaded before. */
  prepareDownload: (generatedProjectId: string, force = false) =>
    apiFetch<PreparedDownload>(`/api/meta-factory/${encodeURIComponent(generatedProjectId)}/prepare-download${query({ force: force || undefined })}`, {
      method: 'POST', timeoutMs: LONG_TIMEOUT_MS,
    }),
  downloadPackage: (generatedProjectId: string) => apiBlob(`/api/meta-factory/${encodeURIComponent(generatedProjectId)}/download`),
  exportToProvider: (generatedProjectId: string, provider: 'github' | 'gitlab', body: GeneratedProjectExportRequest) =>
    apiFetch<GeneratedProjectExportResponse>(`/api/meta-factory/${encodeURIComponent(generatedProjectId)}/export/${provider}`, {
      method: 'POST', body, timeoutMs: LONG_TIMEOUT_MS,
    }),
  downloads: () => apiFetch<DownloadRecord[]>('/api/downloads'),

  /* The virtual company of one mission, and the workforce behind every company. */
  company: (jobId: string) => apiFetch<VirtualCompanyView | null>(`/api/companies/by-job/${encodeURIComponent(jobId)}`),
  companyAssignments: (jobId: string) => apiFetch<JobAssignment[]>(`/api/companies/by-job/${encodeURIComponent(jobId)}/assignments`),
  companyJobs: (jobId: string) => apiFetch<CompanyJobView[]>(`/api/companies/by-job/${encodeURIComponent(jobId)}/jobs`),
  companyExecutions: (jobId: string) => apiFetch<AgentExecutionView[]>(`/api/companies/by-job/${encodeURIComponent(jobId)}/executions`),
  companyExpansions: (jobId: string) => apiFetch<ExpansionRequestView[]>(`/api/companies/by-job/${encodeURIComponent(jobId)}/expansions`),
  companyPlan: (jobId: string) => apiFetch<ImplementationPlanView | null>(`/api/companies/by-job/${encodeURIComponent(jobId)}/plan`),
  agent: (jobId: string, instanceId: string) =>
    apiFetch<AgentDetailView>(`/api/companies/by-job/${encodeURIComponent(jobId)}/agents/${encodeURIComponent(instanceId)}`),
  roleMap: () => apiFetch<RoleMapView>('/api/companies/roles'),
  certifications: () => apiFetch<CertificationView[]>('/api/companies/certifications'),
  compositions: () => apiFetch<CompositionsRead>('/api/workforce/compositions'),
  testRoomProfiles: () => apiFetch<TestRoomProfilesRead>('/api/test-room/profiles'),
  stackCertifications: () => apiFetch<StackCertificationRecord[]>('/api/registry/stack-certifications'),
  cognitiveCertifications: () => apiFetch<CognitiveCertificationsRead>('/api/workforce/cognitive-certifications'),
  languagePacks: () => apiFetch<LanguagePacksRead>('/api/workforce/languages'),

  /** The planner answers "who would we staff for this stack" without hiring anyone. */
  planWorkforce: (body: WorkforcePlanRequest) => apiFetch<WorkforcePlanRead>('/api/workforce/plan', { method: 'POST', body, timeoutMs: LONG_TIMEOUT_MS }),

  /* Engineering: the workspace itself, its changes and its verification runs. */
  labOverview: (generatedProjectId: string) =>
    apiFetch<EngineeringLabOverview>(`/api/engineering-lab/projects/${encodeURIComponent(generatedProjectId)}/overview`),
  runCommand: (generatedProjectId: string, command: string) =>
    apiFetch<TerminalRun>(`/api/engineering-lab/projects/${encodeURIComponent(generatedProjectId)}/terminal`, {
      method: 'POST', body: { command, timeout_seconds: 30 }, timeoutMs: LONG_TIMEOUT_MS,
    }),
  changeRequest: (changeRequestId: string) => apiFetch<ChangeRequest>(`/api/change-requests/${encodeURIComponent(changeRequestId)}`),
  changeRequestDiff: (changeRequestId: string) => apiFetch<ChangeRequestDiff>(`/api/change-requests/${encodeURIComponent(changeRequestId)}/diff`),
  changeRequestAction: (changeRequestId: string, action: 'analyze' | 'plan' | 'approve' | 'apply' | 'accept' | 'reject' | 'rollback') =>
    apiFetch<ChangeRequest>(`/api/change-requests/${encodeURIComponent(changeRequestId)}/${action}`, { method: 'POST', timeoutMs: LONG_TIMEOUT_MS }),
  testProfile: (generatedProjectId: string) => apiFetch<ProfileMatch>(`/api/test-room/${encodeURIComponent(generatedProjectId)}/profile`),
  testSessions: (generatedProjectId: string) => apiFetch<TestRoomSessionView[]>(`/api/test-room/${encodeURIComponent(generatedProjectId)}/sessions`),
  runTests: (generatedProjectId: string) =>
    apiFetch<TestRoomRun>(`/api/test-room/${encodeURIComponent(generatedProjectId)}/run`, { method: 'POST', timeoutMs: LONG_TIMEOUT_MS }),

  /* Runtime: the preview a person can actually look at, and what its browser logged. */
  previewByProject: (generatedProjectId: string) => apiFetch<LivePreviewSession>(`/api/live-preview/by-project/${encodeURIComponent(generatedProjectId)}`),
  startPreview: (generatedProjectId: string) =>
    apiFetch<LivePreviewSession>('/api/live-preview/start', { method: 'POST', body: { project_id: generatedProjectId }, timeoutMs: LONG_TIMEOUT_MS }),
  stopPreview: (sessionId: string) => apiFetch<null>(`/api/live-preview/${encodeURIComponent(sessionId)}/stop`, { method: 'POST' }),
  previewConsole: (sessionId: string) => apiFetch<ConsoleLogEntry[]>(`/api/live-preview/${encodeURIComponent(sessionId)}/console`),

  /* Modernization and governance. */
  modernizeLatest: () => apiFetch<ModernizeProjectSummary | null>('/api/modernize/projects/latest'),
  policyExceptions: () => apiFetch<SandboxPolicyException[]>('/api/execution/policy-exceptions'),
  gitIntegration: (provider: 'github' | 'gitlab') => apiFetch<GitProviderConnection>(`/api/integrations/git/${provider}`),

  /* Settings: the account's own keys, plan, security, workspace and preferences. */
  aiKeys: () => apiFetch<AiKeyListResponse>('/api/user-ai-keys'),
  addAiKey: (body: { readonly provider: string; readonly nome: string; readonly api_key: string; readonly modelo_padrao?: string }) =>
    apiFetch<AiKeyView>('/api/user-ai-keys', { method: 'POST', body }),
  setDefaultAiKey: (keyId: string) => apiFetch<AiKeyView>(`/api/user-ai-keys/${encodeURIComponent(keyId)}/set-default`, { method: 'POST' }),
  testAiKey: (keyId: string) => apiFetch<TestKeyResponse>(`/api/user-ai-keys/${encodeURIComponent(keyId)}/test`, { method: 'POST', timeoutMs: LONG_TIMEOUT_MS }),
  deleteAiKey: (keyId: string) => apiFetch<null>(`/api/user-ai-keys/${encodeURIComponent(keyId)}`, { method: 'DELETE' }),
  setActiveLlm: (body: { readonly provider: string | null; readonly model: string | null }) =>
    apiFetch<ActiveLlmSettings>('/api/llm/settings/active', { method: 'PUT', body }),
  llmUsageByModel: () => apiFetch<LlmModelUsage[]>('/api/llm/usage/by-model'),

  trial: () => apiFetch<TrialView | null>('/api/billing/trial'),
  subscription: () => apiFetch<SubscriptionView | null>('/api/billing/subscription'),
  billingUsage: () => apiFetch<UsageSummary>('/api/billing/usage'),
  entitlements: () => apiFetch<EntitlementCheck[]>('/api/billing/entitlements'),

  updateProfile: (body: { readonly full_name?: string; readonly locale?: string }) =>
    apiFetch<UserPublic>('/api/auth/me', { method: 'PATCH', body }),
  sessions: () => apiFetch<AccountSession[]>('/api/auth/me/sessions'),
  revokeSession: (sessionId: string) => apiFetch<null>(`/api/auth/me/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),
  revokeOtherSessions: () => apiFetch<null>('/api/auth/me/sessions', { method: 'DELETE' }),
  enroll2fa: () => apiFetch<TwoFactorEnrollment>('/api/auth/me/2fa/enroll', { method: 'POST' }),
  verify2fa: (code: string) => apiFetch<UserPublic>('/api/auth/me/2fa/verify', { method: 'POST', body: { code } }),
  exportAccount: () => apiFetch<unknown>('/api/auth/me/export'),

  workspaceMembers: (workspaceId: string) => apiFetch<WorkspaceMember[]>(`/api/workspaces/${encodeURIComponent(workspaceId)}/members`),
  aiPreferences: () => apiFetch<UserPreferencesBlob>('/api/users/me/preferences/ai'),
  saveAiPreferences: (data: Record<string, unknown>) =>
    apiFetch<UserPreferencesBlob>('/api/users/me/preferences/ai', { method: 'PUT', body: { data } }),
  connectGit: (provider: 'github' | 'gitlab', token: string) =>
    apiFetch<GitProviderConnection>(`/api/integrations/git/${provider}/connect`, { method: 'POST', body: { token } }),
  validateGit: (provider: 'github' | 'gitlab') =>
    apiFetch<GitProviderConnection>(`/api/integrations/git/${provider}/validate`, { method: 'POST' }),

  /* Platform: what the installation itself reports about its own state. */
  systemStatus: () => apiFetch<SystemStatusResponse>('/api/system-status'),
  aiStatus: () => apiFetch<AiStatusRead>('/api/ai-status'),
  roadmap: () => apiFetch<RoadmapResponse>('/api/roadmap'),
  decisionTraces: () => apiFetch<LlmDecisionTrace[]>('/api/observability/decisions'),
  runtimeConfig: () => apiFetch<PlatformRuntimeConfig>('/api/runtime/config'),
  saveRuntimeConfig: (body: Record<string, unknown>) =>
    apiFetch<PlatformRuntimeConfig>('/api/runtime/config', { method: 'PUT', body }),
  plans: () => apiFetch<PlanView[]>('/api/billing/plans', { refreshOn401: false }),

  /* Definition: the room's own conversation, documents and gates. */
  sendRoomMessage: (roomId: string, content: string) =>
    apiFetch<ProjectRoom>(`/api/project-rooms/${encodeURIComponent(roomId)}/message`, { method: 'POST', body: { content }, timeoutMs: LONG_TIMEOUT_MS }),
  generatePrompt: (roomId: string) =>
    apiFetch<ProjectRoom>(`/api/project-rooms/${encodeURIComponent(roomId)}/generate-prompt`, { method: 'POST', timeoutMs: LONG_TIMEOUT_MS }),
  revisePrompt: (roomId: string, adjustment: string) =>
    apiFetch<ProjectRoom>(`/api/project-rooms/${encodeURIComponent(roomId)}/revise-prompt`, { method: 'POST', body: { adjustment }, timeoutMs: LONG_TIMEOUT_MS }),
  approvePrompt: (roomId: string) =>
    apiFetch<ProjectRoom>(`/api/project-rooms/${encodeURIComponent(roomId)}/approve`, { method: 'POST', timeoutMs: LONG_TIMEOUT_MS }),
  generateBlueprint: (roomId: string) =>
    apiFetch<ProjectRoom>(`/api/project-rooms/${encodeURIComponent(roomId)}/blueprint`, { method: 'POST', timeoutMs: LONG_TIMEOUT_MS }),
  cancelBlueprint: (roomId: string) =>
    apiFetch<ProjectRoom>(`/api/project-rooms/${encodeURIComponent(roomId)}/blueprint/cancel`, { method: 'POST' }),
  restoreBlueprint: (roomId: string, version: number) =>
    apiFetch<ProjectRoom>(`/api/project-rooms/${encodeURIComponent(roomId)}/blueprints/${version}/restore`, { method: 'POST' }),
  approveStack: (roomId: string) =>
    apiFetch<ProjectRoom>(`/api/project-rooms/${encodeURIComponent(roomId)}/stack/approve`, { method: 'POST' }),
  runEngineeringReview: (roomId: string) =>
    apiFetch<ProjectRoom>(`/api/project-rooms/${encodeURIComponent(roomId)}/engineering-review`, { method: 'POST', timeoutMs: LONG_TIMEOUT_MS }),
  repairEngineeringReview: (roomId: string) =>
    apiFetch<ProjectRoom>(`/api/project-rooms/${encodeURIComponent(roomId)}/engineering-review/repair`, { method: 'POST', timeoutMs: LONG_TIMEOUT_MS }),
  sendToGenerator: (roomId: string) =>
    apiFetch<ProjectRoom>(`/api/project-rooms/${encodeURIComponent(roomId)}/send-to-generator`, { method: 'POST', timeoutMs: LONG_TIMEOUT_MS }),
  roomMemories: (roomId: string) => apiFetch<Memory[]>(`/api/project-rooms/${encodeURIComponent(roomId)}/memories`),
  workEstimate: (roomId: string) => apiFetch<WorkEstimate>(`/api/project-rooms/${encodeURIComponent(roomId)}/work-estimate`),

  interfacePreferences: () => apiFetch<UserPreferencesBlob>('/api/users/me/preferences/interface'),
  saveInterfacePreferences: (data: Record<string, unknown>) =>
    apiFetch<UserPreferencesBlob>('/api/users/me/preferences/interface', { method: 'PUT', body: { data } }),
};

/** OAuth is a full-page navigation, never a fetch: the backend answers with a redirect to the provider. */
export function oauthStartUrl(provider: 'google' | 'github'): string {
  return `/api/auth/oauth/${provider}`;
}
