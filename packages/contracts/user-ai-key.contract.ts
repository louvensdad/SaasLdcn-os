// Shared contract for User Key Boost (user-owned LLM keys).
// Mirrors apps/api/app/schemas/user_ai_key.py. The raw key is NEVER part of any
// response â€” only a masked tail.

export type KeyProvider = 'anthropic' | 'openai' | 'google' | 'openrouter' | 'deepseek' | 'custom';

export interface KeySessionStatus {
  provider: string;
  masked: string;
  active: boolean;
  /** Seconds until the stored key self-destructs; null when the backend can't tell. */
  expires_in_seconds?: number | null;
}

export interface KeySessionStatusResponse {
  sessions: KeySessionStatus[];
}

export interface TestKeyRequest {
  provider: KeyProvider;
  api_key: string;
}

export interface TestKeyResponse {
  ok: boolean;
  provider: string;
  model?: string | null;
  http_status: number;
  message: string;
}