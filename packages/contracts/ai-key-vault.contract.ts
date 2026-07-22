// Shared contract for the permanent, named, multi-key-per-provider BYOK vault
// (vault 68 - Gestão de Chaves de IA). Mirrors apps/api/app/schemas/user_ai_key.py.
// The raw key is NEVER part of any response after creation -- only a masked tail.

export type KeyProvider =
  | 'openai' | 'anthropic' | 'google' | 'deepseek' | 'groq';

export interface CreateAiKeyRequest {
  provider: KeyProvider;
  nome: string;
  api_key: string;
  apelido?: string | null;
  modelo_padrao?: string | null;
}

export interface UpdateAiKeyRequest {
  nome?: string | null;
  apelido?: string | null;
  modelo_padrao?: string | null;
  ativo?: boolean | null;
}

export interface AiKeyView {
  id: string;
  provider: string;
  nome: string;
  apelido?: string | null;
  masked: string;
  modelo_padrao?: string | null;
  status: 'untested' | 'valid' | 'invalid' | 'unavailable';
  ativo: boolean;
  is_default: boolean;
  created_at: string;
  last_used_at?: string | null;
  last_validated_at?: string | null;
}

export interface AiKeyListResponse {
  keys: AiKeyView[];
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
  latency_ms?: number | null;
  validated_at?: string | null;
}
