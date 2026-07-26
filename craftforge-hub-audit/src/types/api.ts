// Types derived from openapi.yaml contract
export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface UserResponse {
  id: string
  email: string
  name: string
  role: 'user' | 'admin'
  plan: 'free' | 'pro' | 'enterprise'
  instances_limit: number
  created_at: string
}

export interface UserAdminResponse extends UserResponse {
  active_instances: number
  updated_at: string
}

export interface AccountResponse {
  id: string
  user_id: string
  username: string
  game: string
  status: 'active' | 'inactive'
  created_at: string
}

export interface CreateAccountRequest {
  username: string
  password: string
  game: string
}

export interface UpdateAccountRequest {
  username?: string
  password?: string
  game?: string
  status?: 'active' | 'inactive'
}

export interface InstanceResponse {
  id: string
  account_id: string
  account_username: string
  game: string
  status: 'online' | 'offline' | 'starting' | 'stopping'
  fps: number | null
  ram_mb: number | null
  uptime_seconds: number | null
  macro_running: boolean
  created_at: string
}

export interface MacroResponse {
  id: string
  user_id: string
  name: string
  script: string
  created_at: string
  updated_at: string
}

export interface CreateMacroRequest {
  name: string
  script: string
}

export interface UpdateMacroRequest {
  name?: string
  script?: string
}

export interface ExecutionLogResponse {
  id: string
  instance_id: string
  macro_id: string
  macro_name: string
  account_username: string
  result: 'success' | 'failure'
  output: string | null
  error_message: string | null
  started_at: string
  finished_at: string
}

export interface RegisterRequest {
  name: string
  email: string
  password: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RefreshRequest {
  refresh_token: string
}

export interface ErrorResponse {
  detail: string
  code?: string
  validation_errors?: ValidationErrorItem[]
}

export interface ValidationErrorItem {
  field: string
  message: string
}

export interface ApiError {
  status: number
  code: string
  message: string
  details?: Record<string, string[]>
}

// WebSocket message types
export interface WsInstanceStatus {
  type: 'instance_status'
  instance_id: string
  status: 'online' | 'offline' | 'starting' | 'stopping'
  fps: number | null
  ram_mb: number | null
  uptime_seconds: number | null
  macro_running: boolean
}

export interface WsMacroProgress {
  type: 'macro_progress'
  execution_log_id: string
  instance_id: string
  macro_id: string
  progress: number
  status: 'running' | 'completed' | 'failed'
  output?: string
  error_message?: string
}

export type WsMessage = WsInstanceStatus | WsMacroProgress