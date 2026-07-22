export type LlmProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'groq';

export type LlmSettingsStatus =
  | 'ready'
  | 'not_configured'
  | 'initializing'
  | 'auth_error'
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
  /** Real context-window size (tokens) of the active model from the backend
   * model registry; null when unknown. */
  contextTokens: number | null;
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
// (app/engines/llm/response_cache.py via Prometheus Counter/Gauge). Token/
// cost telemetry lives separately in LlmUsageStats (llm_usage_records).
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

export interface LlmUsageBucket {
  hour: string;
  requests: number;
  tokens: number;
  avg_latency_ms: number;
  cost_usd: number;
}

export interface LlmUsageWindowTotals {
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  saved_tokens: number;
  avg_latency_ms: number | null;
  estimated_cost_usd: number;
  cache_savings_usd: number;
}

/** Real per-call LLM telemetry recorded by the backend router
 * (llm_usage_records): provider-reported token counts, wall-clock latency,
 * registry-priced cost. `previous` covers the window immediately before,
 * for honest deltas. */
export interface LlmUsageStats extends LlmUsageWindowTotals {
  window_hours: number;
  previous: LlmUsageWindowTotals;
  buckets: readonly LlmUsageBucket[];
}

/** One real model's usage in the window (GET /llm/usage/by-model) -- a model
 * with zero calls simply doesn't appear; this is not a synthetic benchmark
 * race, it's an aggregate of actual `llm_usage_records` rows. */
export interface LlmModelUsage {
  model: string;
  provider: string;
  requests: number;
  avg_latency_ms: number | null;
  estimated_cost_usd: number;
  cache_hit_rate: number;
}
