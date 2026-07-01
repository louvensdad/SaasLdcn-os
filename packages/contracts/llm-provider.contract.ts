// Shared contract for LLM provider selection + temporary user key.
// Mirrors apps/api/app/schemas/modernize.py + user_ai_key.contract.ts.

export type LlmProviderId = 'anthropic' | 'openai' | 'google' | 'deepseek' | 'openrouter' | 'ollama';

export interface LlmProviderConfig {
  id: string; // vault provider id; DeepSeek card maps to 'openrouter'
  name: string;
  description: string;
  recommended_for: string;
  key_required: boolean;
  status: 'ready' | 'not_configured';
}

export interface LlmProviderCatalog {
  providers: LlmProviderConfig[];
}

export interface LlmConnectionTestRequest {
  provider: string;
}

export interface LlmConnectionTestResult {
  ok: boolean;
  provider: string;
  model?: string | null;
  message: string; // NEVER contains the key
  degraded: boolean;
}

// The temporary key is session-scoped (TTL), encrypted in RAM, and only ever
// surfaced as a masked tail â€” never the raw value.
export interface TemporaryLlmKey {
  provider: string;
  masked: string; // e.g. "â€¢â€¢â€¢â€¢cdef"
  active: boolean;
}
