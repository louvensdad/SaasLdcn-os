// Shared catalog of selectable LLM models, used by the meta-factory and the
// wizard's AI intake. `id === ''` means "Auto (per role)".
export interface LlmModelOption {
  readonly id: string;
  readonly label: string;
  /** Runs locally via Ollama — no API key, slower. */
  readonly local?: boolean;
  /** Any OpenAI-compatible server configured via env. */
  readonly custom?: boolean;
}

export const MODELS: ReadonlyArray<LlmModelOption> = [
  { id: '', label: 'Auto (por papel)' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  { id: 'claude-fable-5', label: 'Claude Fable 5' },
  { id: 'gpt-4.1', label: 'OpenAI GPT-4.1' },
  { id: 'o4-mini', label: 'OpenAI o4-mini' },
  { id: 'gemini-2.5-pro', label: 'Google Gemini 2.5 Pro' },
  { id: 'gemini-2.5-flash', label: 'Google Gemini 2.5 Flash' },
  // Local, no API key — runs on the user's machine via Ollama (slower).
  { id: 'qwen2.5-coder:7b', label: 'Local · Qwen2.5 Coder 7B (Ollama)', local: true },
  { id: 'qwen2.5-coder:32b', label: 'Local · Qwen2.5 Coder 32B (Ollama)', local: true },
  { id: 'deepseek-coder-v2:16b', label: 'Local · DeepSeek Coder V2 16B (Ollama)', local: true },
  // Online via OpenRouter — needs an OpenRouter key ("Use my own key"); has free models.
  { id: 'deepseek/deepseek-r1:free', label: 'OpenRouter · DeepSeek R1 (grátis)' },
  { id: 'deepseek/deepseek-chat', label: 'OpenRouter · DeepSeek Chat' },
  { id: 'qwen/qwen-2.5-coder-32b-instruct', label: 'OpenRouter · Qwen2.5 Coder 32B' },
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'OpenRouter · Llama 3.3 70B' },
  // Online via DeepSeek's first-class API — needs a DeepSeek key ("Use my own key").
  { id: 'deepseek-chat', label: 'DeepSeek · Chat (V3)' },
  { id: 'deepseek-reasoner', label: 'DeepSeek · Reasoner (R1)' },
  // Any OpenAI-compatible server (vLLM, LM Studio, Together, Groq…) configured via env.
  { id: 'custom', label: 'Custom (OpenAI-compat)', custom: true },
];
