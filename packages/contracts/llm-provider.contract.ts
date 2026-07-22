// Shared contract for LLM provider selection and persistent encrypted user keys.
// Mirrors apps/api/app/schemas/modernize.py and ai-key-vault.contract.ts.

export type LlmProviderId = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'groq';
export type LlmProviderStatus = 'ready' | 'initializing' | 'not_configured' | 'auth_error' | 'unavailable';

export interface LlmProviderConfig {
  id: LlmProviderId;
  name: string;
  description: string;
  recommended_for: string;
  key_required: boolean;
  status: LlmProviderStatus;
}

export interface LlmProviderCatalog {
  providers: LlmProviderConfig[];
}

export interface LlmConnectionTestRequest {
  provider: LlmProviderId;
}

export interface LlmConnectionTestResult {
  ok: boolean;
  provider: LlmProviderId;
  model?: string | null;
  message: string;
  degraded: boolean;
}

// Encrypted at rest and owner-scoped; clients receive only the masked value.
export interface PersistentLlmKey {
  provider: LlmProviderId;
  masked: string;
  active: boolean;
}
