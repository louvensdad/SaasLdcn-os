export type MissionCategory = 'create' | 'analyze' | 'fix' | 'evolve' | 'plan' | 'research';
export type MissionTypeId =
  | 'software.build' | 'automation.create' | 'agent.create' | 'integration.create'
  | 'documentation.create' | 'architecture.design' | 'api.design' | 'process.design'
  | 'project.analyze' | 'architecture.review' | 'security.audit' | 'performance.analyze'
  | 'data.analyze' | 'requirements.analyze' | 'dependencies.analyze' | 'error.diagnose'
  | 'build.fix' | 'security.fix' | 'performance.fix' | 'integration.fix'
  | 'system.modernize' | 'tech.migrate' | 'code.refactor' | 'system.scale'
  | 'product.plan' | 'project.plan' | 'sprint.plan' | 'infrastructure.plan' | 'deploy.plan'
  | 'tech.research' | 'solutions.compare' | 'poc.create' | 'feasibility.study' | 'impact.assess';
export const MVP_MISSION_TYPE_IDS = [
  'software.build', 'error.diagnose', 'project.analyze', 'automation.create',
  'project.plan', 'architecture.review', 'system.modernize', 'documentation.create',
] as const satisfies readonly MissionTypeId[];
export type MvpMissionTypeId = (typeof MVP_MISSION_TYPE_IDS)[number];
export type ExecutionMode = 'guided' | 'quick' | 'expert' | 'analysis' | 'collaborative' | 'autonomous' | 'learning';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type MissionStatus = 'active' | 'paused' | 'completed' | 'abandoned';
export type SpecialistRole =
  | 'software_architect' | 'backend_engineer' | 'frontend_engineer' | 'database_engineer'
  | 'security_engineer' | 'qa_engineer' | 'devops_engineer' | 'automation_architect'
  | 'integration_specialist' | 'risk_analyst' | 'technical_writer' | 'performance_analyst'
  | 'security_auditor' | 'product_strategist' | 'data_analyst';
export type InputType = 'text' | 'files' | 'code' | 'logs' | 'urls' | 'schemas' | 'project_ref';
export type FieldType = 'text' | 'textarea' | 'select' | 'multiselect' | 'chips' | 'code' | 'file' | 'number' | 'toggle' | 'entity-editor' | 'workflow-editor';

export interface FieldAIAction {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly prompt: string;
  readonly insertMode: 'replace' | 'append' | 'suggest';
}
export interface FieldValidation {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly min?: number;
  readonly max?: number;
  readonly pattern?: string;
  readonly message?: string;
}
export interface MissionFieldDefinition {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly type: FieldType;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly options?: readonly string[];
  readonly aiActions: readonly FieldAIAction[];
  readonly validation?: FieldValidation;
  readonly dependsOn?: { readonly fieldId: string; readonly value: unknown };
}
export interface MissionStepDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly fields: readonly MissionFieldDefinition[];
  readonly isConditional?: boolean;
  readonly condition?: (context: MissionContext) => boolean;
  readonly isRequired?: boolean;
  readonly dependsOn?: readonly string[];
  readonly specialist?: SpecialistRole;
}
export interface ConditionalStepDefinition {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly fields?: readonly MissionFieldDefinition[];
  readonly condition: (context: MissionContext) => boolean;
  readonly insertAfter: string;
  readonly specialist?: SpecialistRole;
}
export interface GapRule {
  readonly id: string;
  readonly check: (context: MissionContext) => boolean;
  readonly title: string;
  readonly description?: string;
  readonly severity: 'critical' | 'important' | 'optional';
  readonly suggestedAction: string;
  readonly relatedStepId?: string;
}
export interface RiskRule {
  readonly id: string;
  readonly check: (context: MissionContext) => boolean;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  readonly category: string;
  readonly title: string;
  readonly description: string;
  readonly suggestedAction: string;
  readonly affectedSteps?: readonly string[];
}
export interface ValidationRule {
  readonly id: string;
  readonly check: (context: MissionContext) => boolean;
  readonly message: string;
  readonly severity: 'error' | 'warning';
  readonly relatedStepId?: string;
}
export type ArtifactType = 'blueprint' | 'prompt_md' | 'architecture' | 'data_model' | 'api_contracts' | 'test_plan' | 'deploy_plan' | 'workflow' | 'report' | 'roadmap' | 'backlog' | 'diagnosis' | 'comparison' | 'documentation' | 'migration_plan';
export type ArtifactFormat = 'json' | 'markdown' | 'yaml' | 'text' | 'html';
export interface ArtifactDefinition {
  readonly type: ArtifactType;
  readonly title: string;
  readonly format: ArtifactFormat;
  readonly canFeedMission?: readonly MissionTypeId[];
}
export interface MissionGenome {
  readonly id: MissionTypeId;
  readonly category: MissionCategory;
  readonly title: string;
  readonly description: string;
  /** Lucide icon name, resolved by the presentation layer. */
  readonly icon: string;
  readonly estimatedTime: string;
  readonly complexity: number;
  readonly steps: readonly MissionStepDefinition[];
  readonly conditionalSteps: readonly ConditionalStepDefinition[];
  readonly specialists: readonly SpecialistRole[];
  readonly validations: readonly ValidationRule[];
  readonly artifacts: readonly ArtifactDefinition[];
  readonly inputTypes: readonly InputType[];
  readonly executionModes: readonly ExecutionMode[];
  readonly gapRules: readonly GapRule[];
  readonly riskRules: readonly RiskRule[];
  readonly knowledgeTopics: readonly string[];
  readonly canReceiveFrom?: readonly MissionTypeId[];
  readonly canFeedInto?: readonly MissionTypeId[];
  readonly primaryActionLabel?: string;
  readonly nextRoute?: string;
}

export interface UploadedFile { readonly id: string; readonly name: string; readonly size: number; readonly mediaType: string; readonly storageRef?: string; }
export interface CodeSnippet { readonly id: string; readonly language?: string; readonly filename?: string; readonly content: string; }
export interface HistoryEntry { readonly id: string; readonly event: string; readonly actor: 'user' | 'ai' | 'system'; readonly timestamp: string; readonly metadata: Readonly<Record<string, unknown>>; }
export interface ImpactedStep { readonly stepId: string; readonly fieldIds?: readonly string[]; readonly reason: string; }
export type DecisionSource = 'user' | 'ai_accepted' | 'ai_modified' | 'default';
export interface Decision {
  readonly id: string;
  readonly stepId: string;
  readonly fieldId: string;
  readonly value: unknown;
  readonly source: DecisionSource;
  readonly reason?: string | null;
  readonly timestamp: string;
  readonly impacts: readonly ImpactedStep[];
}
export interface Rejection { readonly id: string; readonly suggestionId: string; readonly reason?: string; readonly timestamp: string; }
export interface Gap { readonly id: string; readonly title: string; readonly description: string; readonly severity: 'critical' | 'important' | 'optional'; readonly relatedStepId?: string | null; readonly suggestedAction: string; readonly status: 'open' | 'addressed' | 'dismissed'; readonly dismissReason?: string | null; }
export interface Risk { readonly id: string; readonly severity: 'critical' | 'high' | 'medium' | 'low'; readonly category: string; readonly title: string; readonly description: string; readonly affectedSteps: readonly string[]; readonly suggestedAction: string; readonly autoDetected: boolean; readonly dismissed: boolean; }
export interface Inconsistency { readonly id: string; readonly title: string; readonly description: string; readonly affectedFields: readonly string[]; readonly suggestedFix: string; readonly blocking: boolean; }
export interface MissionInputs {
  readonly text: readonly string[];
  readonly files: readonly UploadedFile[];
  readonly code: readonly CodeSnippet[];
  readonly logs: readonly string[];
  readonly urls: readonly string[];
  readonly schemas: readonly string[];
  readonly projectRef?: string;
}
export interface MissionContext {
  readonly inputs: MissionInputs;
  readonly answers: Readonly<Record<string, unknown>>;
  readonly decisions: readonly Decision[];
  readonly rejections: readonly Rejection[];
  readonly gaps: readonly Gap[];
  readonly risks: readonly Risk[];
  readonly inconsistencies: readonly Inconsistency[];
  readonly history: readonly HistoryEntry[];
  readonly derived: Readonly<Record<string, unknown>>;
}
export type JourneyStepStatus = 'pending' | 'active' | 'completed' | 'skipped' | 'blocked' | 'attention';
export interface StepAlert { readonly id: string; readonly tone: 'info' | 'warning' | 'danger'; readonly message: string; }
export interface JourneyStep { readonly definitionId: string; readonly status: JourneyStepStatus; readonly completedAt?: string | null; readonly validationStatus?: 'valid' | 'invalid' | 'warning'; readonly alerts: readonly StepAlert[]; }
export interface JourneyState { readonly steps: readonly JourneyStep[]; readonly currentStepId: string | null; readonly progress: number; }
export interface MissionArtifact { readonly id: string; readonly type: ArtifactType; readonly title: string; readonly content: unknown; readonly format: ArtifactFormat; readonly generatedAt: string; readonly canFeedMission?: readonly MissionTypeId[]; }
export interface MissionInstance {
  readonly id: string;
  readonly type: MissionTypeId;
  readonly userId?: string;
  readonly workspaceId: string;
  readonly projectId?: string;
  readonly status: MissionStatus;
  readonly mode: ExecutionMode;
  readonly experienceLevel: ExperienceLevel;
  readonly title?: string;
  readonly context: MissionContext;
  readonly journey: JourneyState;
  readonly artifacts: readonly MissionArtifact[];
  readonly degraded: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}
export interface MissionInstanceSummary { readonly id: string; readonly type: MissionTypeId; readonly workspaceId: string; readonly status: MissionStatus; readonly title: string; readonly degraded: boolean; readonly progress: number; readonly createdAt: string; readonly updatedAt: string; }
export interface ValidationError { readonly fieldId: string; readonly message: string; }
export interface ValidationResult { readonly valid: boolean; readonly errors: readonly ValidationError[]; }
export interface ImpactAnalysis { readonly hasImpact: boolean; readonly impactedSteps: readonly ImpactedStep[]; readonly message: string; }
export interface AISuggestion {
  readonly id: string;
  readonly fieldId: string;
  readonly stepId: string;
  readonly actionId: string;
  readonly actionLabel: string;
  readonly specialist: SpecialistRole;
  readonly current: unknown;
  readonly proposed: string;
  readonly reason: string;
  readonly impact: string;
  readonly insertMode: FieldAIAction['insertMode'];
  readonly degraded: boolean;
}
export interface UserAPIConfig { readonly provider: 'openai' | 'anthropic' | 'google' | 'deepseek' | 'groq' | 'custom'; readonly hasValidatedUserKey: boolean; readonly model: string; readonly baseUrl?: string; }
export function createEmptyMissionContext(): MissionContext {
  return { inputs: { text: [], files: [], code: [], logs: [], urls: [], schemas: [] }, answers: {}, decisions: [], rejections: [], gaps: [], risks: [], inconsistencies: [], history: [], derived: {} };
}
