import type {
  AgentId,
  ContractMetadata,
  ContractValue,
  ExecutionId,
  OrchestrationRunId,
  ProjectId,
  StackId,
  TimestampISO,
} from './shared.contract';

export enum AgentRole {
  ORCHESTRATOR = 'orchestrator',
  ARCHITECT = 'architect',
  FRONTEND_SPECIALIST = 'frontend_specialist',
  BACKEND_SPECIALIST = 'backend_specialist',
  SECURITY = 'security',
  TESTING = 'testing',
  PROMPT_MASTER = 'prompt_master',
  GATEKEEPER = 'gatekeeper',
  LDCN = 'ldcn',
}

export enum AgentStatus {
  IDLE = 'idle',
  READY = 'ready',
  RUNNING = 'running',
  BLOCKED = 'blocked',
  FAILED = 'failed',
  COMPLETE = 'complete',
}

export enum AgentExecutionStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface AgentErrorContract {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, ContractValue>;
}

export interface AgentContract extends ContractMetadata {
  readonly agentId: AgentId;
  readonly role: AgentRole;
  readonly name: string;
  readonly description: string;
  readonly status: AgentStatus;
  readonly responsibilities: readonly string[];
  readonly allowedAccess: readonly string[];
  readonly forbiddenAccess: readonly string[];
  readonly inputSchema: Record<string, ContractValue>;
  readonly outputSchema: Record<string, ContractValue>;
  readonly requiresOrchestrator: boolean;
  readonly supportedStackIds?: readonly StackId[];
}

export interface AgentExecutionContract extends ContractMetadata {
  readonly executionId: ExecutionId;
  readonly agentId: AgentId;
  readonly orchestratorRunId?: OrchestrationRunId;
  readonly projectId?: ProjectId;
  readonly status: AgentExecutionStatus;
  readonly input: Record<string, ContractValue>;
  readonly output?: Record<string, ContractValue>;
  readonly errors: readonly AgentErrorContract[];
  readonly startedAt: TimestampISO;
  readonly completedAt?: TimestampISO;
}
