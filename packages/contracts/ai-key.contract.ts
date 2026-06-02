import type { BlueprintGenerationMode } from './blueprint.contract';
import type { ContractMetadata, SessionId, TimestampISO } from './shared.contract';

export type AiKeyProvider = 'openai' | 'gemini' | 'anthropic';
export type AiKeyStorageMode = 'session_only' | 'encrypted_session';
export type AiKeySessionStatus = 'no_key' | 'temporary_key_active' | 'platform_key_active' | 'key_deleted';

export type BoostGenerationMode = Extract<
  BlueprintGenerationMode,
  'local_build_90' | 'platform_boost_100' | 'user_key_boost'
>;

export interface UserAiKeySessionRequest {
  readonly provider: AiKeyProvider;
  readonly api_key: string;
  readonly storage_mode: AiKeyStorageMode;
  readonly delete_after_generation: boolean;
}

export interface UserAiKeySessionResponse extends ContractMetadata {
  readonly status: AiKeySessionStatus;
  readonly provider: AiKeyProvider;
  readonly storage_mode: AiKeyStorageMode;
  readonly session_id: SessionId | string;
  readonly expires_at?: TimestampISO | string | null;
  readonly delete_after_generation: boolean;
  readonly key_material_returned: false;
  readonly redacted_fields: readonly ['api_key'];
}

export interface UserAiKeyStatusResponse extends ContractMetadata {
  readonly status: AiKeySessionStatus;
  readonly active_provider?: AiKeyProvider | null;
  readonly storage_mode?: AiKeyStorageMode | null;
  readonly session_id?: SessionId | string | null;
  readonly expires_at?: TimestampISO | string | null;
  readonly delete_after_generation: boolean;
  readonly key_material_returned: false;
}

export interface DeleteUserAiKeySessionResponse extends ContractMetadata {
  readonly status: 'key_deleted';
  readonly deleted: true;
  readonly key_material_returned: false;
}

export interface BoostModeSelection {
  readonly generation_mode: BoostGenerationMode;
  readonly user_key_status: AiKeySessionStatus;
  readonly provider?: AiKeyProvider | null;
  readonly delete_key_after_generation: boolean;
}
