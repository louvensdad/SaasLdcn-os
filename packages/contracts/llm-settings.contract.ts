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

// Real counters already tracked by the process-local LLM response cache
// (app/engines/llm/response_cache.py via Prometheus Counter/Gauge) -- no
// tokens/cost/most-used-model here, since none of that is tracked anywhere.
export interface LlmCacheStats {
  hits: number;
  misses: number;
  stored: number;
  evicted: number;
  expired: number;
  oversized: number;
  entries: number;
  bytes: number;
}
