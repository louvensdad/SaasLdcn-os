// Shared contract for User Key Boost (user-owned LLM keys).
// Mirrors apps/api/app/schemas/user_ai_key.py. The raw key is NEVER part of any
// response — only a masked tail.

export type KeyProvider = 'anthropic' | 'openai' | 'google';

export interface KeySessionStatus {
  provider: string;
  masked: string;
  active: boolean;
}

export interface KeySessionStatusResponse {
  sessions: KeySessionStatus[];
}
