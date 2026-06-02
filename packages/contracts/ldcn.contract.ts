import type { LocaleCode, TranslatableText } from './locale.contract';
import type { ContractId, ContractMetadata, ContractValue, ProjectId, SessionId } from './shared.contract';

export type LdcnPresenceState =
  | 'idle'
  | 'observing'
  | 'thinking'
  | 'speaking_future'
  | 'warning'
  | 'blocked'
  | 'offline';

export type LdcnAction =
  | 'explain_current_page'
  | 'review_blueprint'
  | 'suggest_next_step'
  | 'inspect_gatekeeper'
  | 'prepare_generation'
  | 'open_command_palette';

export interface LdcnSuggestion {
  readonly id: ContractId | string;
  readonly action: LdcnAction;
  readonly label: string;
  readonly summary: string;
  readonly reserved: boolean;
  readonly payload?: Readonly<Record<string, ContractValue>>;
}

export interface LdcnPipelineAwareness {
  readonly route: string;
  readonly phase: string;
  readonly status: 'healthy' | 'degraded' | 'blocked' | 'offline' | 'previewing' | 'ready';
  readonly readiness_label: string;
  readonly project_id?: ProjectId | string;
  readonly session_id?: SessionId | string;
  readonly step_id?: string;
  readonly detail?: string;
}

export interface LdcnContext {
  readonly route: string;
  readonly page_title: string;
  readonly current_phase: string;
  readonly pipeline: LdcnPipelineAwareness;
  readonly locale?: LocaleCode;
  readonly project_id?: ProjectId | string;
  readonly status: LdcnPresenceState;
  readonly summary: string;
  readonly suggestions: readonly LdcnSuggestion[];
}

export interface LdcnVoiceState {
  readonly enabled: boolean;
  readonly status: 'future' | 'reserved' | 'disabled';
  readonly locale?: LocaleCode;
  readonly provider?: string;
}

export interface LdcnAvatarState {
  readonly enabled: boolean;
  readonly status: 'future' | 'reserved' | 'disabled';
  readonly style?: 'orbital' | 'humanoid' | 'abstract';
}

export interface LdcnPresenceSnapshot extends ContractMetadata {
  readonly ldcn_id: ContractId | string;
  readonly presence_state: LdcnPresenceState;
  readonly context: LdcnContext;
  readonly voice_state: LdcnVoiceState;
  readonly avatar_state: LdcnAvatarState;
  readonly future_actions: readonly LdcnAction[];
  readonly narrative?: TranslatableText;
  readonly created_at: string;
  readonly updated_at: string;
}
