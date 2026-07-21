import type { KeyProvider } from '@contracts/ai-key-vault.contract';

/**
 * Where a user without a key can go to buy API credits/tokens for that
 * provider. Only providers with a real, provider-hosted billing/top-up page
 * are listed — "custom"/"ollama"/"lmstudio" (self-hosted or local) have no such page.
 */
export const LLM_BUY_TOKENS_URL: Partial<Record<KeyProvider, string>> = {
  anthropic: 'https://console.anthropic.com/settings/billing',
  openai: 'https://platform.openai.com/settings/organization/billing/overview',
  google: 'https://aistudio.google.com/app/apikey',
  openrouter: 'https://openrouter.ai/credits',
  deepseek: 'https://platform.deepseek.com/top_up',
  groq: 'https://console.groq.com/settings/billing',
};
