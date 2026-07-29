// Shared contract for the LDCN Execution Terminal.
// Mirrors apps/api/app/schemas/execution_terminal.py.

export interface TerminalExecuteRequest {
  command: string;
  cwd?: string;
}

export interface TerminalCommandRecord {
  id: string;
  project_id: string;
  command: string;
  cwd: string;
  status: 'completed' | 'rejected' | 'timeout';
  exit_code?: number | null;
  duration_ms: number;
  stdout_tail: string;
  stderr_tail: string;
  rejection_reason?: string | null;
  executed_by?: string | null;
  started_at: string;
  source: 'user' | 'ai_suggestion';
}

export interface TerminalHistoryResponse {
  project_id: string;
  records: TerminalCommandRecord[];
  allowed_commands: string[];
}

export type TerminalStreamEvent =
  | { type: 'line'; stream: 'stdout' | 'stderr'; line: string }
  | { type: 'done'; record: TerminalCommandRecord }
  | { type: 'error'; detail: string }
  | { type: 'heartbeat' };
