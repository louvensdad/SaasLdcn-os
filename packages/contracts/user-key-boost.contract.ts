import type { BlueprintGenerationMode } from './blueprint.contract';
import type { ContractMetadata, SessionId, TimestampISO } from './shared.contract';

export type UserKeyBoostProvider = 'openai' | 'gemini' | 'anthropic';
export type UserKeyBoostStorageMode = 'session_only' | 'encrypted_session';
export type UserKeyBoostStatus = 'no_key' | 'temporary_key_active' | 'platform_key_active' | 'deleted';

export type UserKeyBoostGenerationMode = Extract<
  BlueprintGenerationMode,
  'local_build_90' | 'platform_boost_100' | 'user_key_boost'
>;

export interface UserKeyBoostSessionRequest {
  readonly provider: UserKeyBoostProvider;
  readonly api_key: string;
  readonly storage_mode: UserKeyBoostStorageMode;
  readonly delete_after_generation: boolean;
}

export interface UserKeyBoostSessionResponse extends ContractMetadata {
  readonly status: UserKeyBoostStatus;
  readonly provider: UserKeyBoostProvider;
  readonly storage_mode: UserKeyBoostStorageMode;
  readonly session_id: SessionId | string;
  readonly expires_at?: TimestampISO | string | null;
  readonly delete_after_generation: boolean;
  readonly key_material_returned: false;
  readonly redacted_fields: readonly ['api_key'];
}

export interface UserKeyBoostStatusResponse extends ContractMetadata {
  readonly status: UserKeyBoostStatus;
  readonly active_provider?: UserKeyBoostProvider | null;
  readonly storage_mode?: UserKeyBoostStorageMode | null;
  readonly session_id?: SessionId | string | null;
  readonly expires_at?: TimestampISO | string | null;
  readonly delete_after_generation: boolean;
  readonly key_material_returned: false;
}

export interface DeleteUserKeyBoostSessionResponse extends ContractMetadata {
  readonly status: 'deleted';
  readonly deleted: true;
  readonly key_material_returned: false;
}

export interface UserKeyBoostModeSelection {
  readonly generation_mode: UserKeyBoostGenerationMode;
  readonly key_status: UserKeyBoostStatus;
  readonly provider?: UserKeyBoostProvider | null;
  readonly delete_after_generation: boolean;
}
