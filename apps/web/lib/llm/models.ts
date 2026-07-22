export interface LlmModelOption {
  readonly id: string;
  readonly label: string;
}

export const MODELS: ReadonlyArray<LlmModelOption> = [
  { id: '', label: 'Auto (por papel)' },
  { id: 'gpt-4.1', label: 'OpenAI GPT-4.1' },
  { id: 'o4-mini', label: 'OpenAI o4-mini' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  { id: 'gemini-2.5-pro', label: 'Google Gemini 2.5 Pro' },
  { id: 'gemini-2.5-flash', label: 'Google Gemini 2.5 Flash' },
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { id: 'llama-3.3-70b-versatile', label: 'Groq · Llama 3.3 70B' },
];
