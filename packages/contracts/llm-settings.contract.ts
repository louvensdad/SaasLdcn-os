export type LlmProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'openrouter'
  | 'ollama';

export type LlmSettingsStatus =
  | 'ready'
  | 'not_configured'
  | 'invalid'
  | 'expired'
  | 'unavailable';

export interface ActiveLlmSettings {
  provider: LlmProviderId | null;
  providerLabel: string | null;
  model: string | null;
  hasKey: boolean;
  status: LlmSettingsStatus;
  lastValidatedAt: string | null;
  lastUsedAt: string | null;
  mode: 'llm' | 'deterministic';
  requiresConfirmation: boolean;
  reason: string;
}

export interface LlmResolution {
  provider: LlmProviderId | null;
  providerLabel: string | null;
  model: string | null;
  mode: 'llm' | 'deterministic';
  reason: string;
  fallbackUsed: boolean;
  keyStatus: LlmSettingsStatus;
  requestedCapability: string;
}
