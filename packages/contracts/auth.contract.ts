import type { LocaleCode } from './locale.contract';

export type UserRole = 'admin' | 'user';

export interface UserRegisterRequest {
  readonly email: string;
  readonly password: string;
  readonly full_name: string;
  readonly locale?: LocaleCode;
  readonly privacy_policy_accepted: boolean;
}

export interface UserLoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface RefreshRequest {
  readonly refresh_token: string;
}

export interface UserPublic {
  readonly user_id: string;
  readonly email: string;
  readonly full_name: string;
  readonly role: UserRole;
  readonly locale: LocaleCode;
  readonly is_active: boolean;
  readonly consent_accepted_at: string | null;
  readonly consent_policy_version: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface TokenResponse {
  readonly access_token: string;
  readonly token_type: 'bearer';
  readonly expires_in: number;
}

export interface AuthResponse {
  readonly user: UserPublic;
  readonly tokens: TokenResponse;
}

export interface UserUpdateRequest {
  readonly full_name?: string;
  readonly locale?: LocaleCode;
}

export interface PasswordChangeRequest {
  readonly current_password: string;
  readonly new_password: string;
}

export interface ConsentRequest {
  readonly accepted: boolean;
  readonly policy_version: string;
}

export interface DataExportResponse {
  readonly contractVersion: string;
  readonly exported_at: string;
  readonly user: UserPublic;
  readonly projects: readonly Record<string, unknown>[];
  readonly audit_events: readonly Record<string, unknown>[];
}

export interface AccountDeletionResponse {
  readonly message: string;
  readonly deleted_at: string;
}
