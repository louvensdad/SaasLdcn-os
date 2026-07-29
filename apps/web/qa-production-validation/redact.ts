/**
 * Sanitizes evidence captured from a REAL production run (console messages,
 * network request/response headers and bodies) before it ever touches disk.
 * Nothing captured by this QA harness may contain a token, cookie, or
 * provider API key -- see spec section 15.
 */

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-ldcn-metrics-token',
]);

// Bearer/JWT-shaped tokens, and provider-key-shaped secrets (OpenAI/DeepSeek
// `sk-...`, Anthropic `sk-ant-...`, Google `AIza...`, generic long hex/base64
// blobs that look like a key rather than incidental text).
const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9\-_.]+/gi,
  /\bsk-[A-Za-z0-9]{10,}/g,
  /\bsk-ant-[A-Za-z0-9\-_]{10,}/g,
  /\bAIza[A-Za-z0-9\-_]{20,}/g,
  /\beyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g, // JWT
];

export function redactText(input: string): string {
  let out = input;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '<redacted>');
  }
  return out;
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SENSITIVE_HEADER_NAMES.has(key.toLowerCase()) ? '<redacted>' : redactText(value);
  }
  return out;
}

export function redactBody(body: string | null | undefined): string | null {
  if (body == null) return null;
  return redactText(body);
}

/** Throws if any known secret shape survives redaction -- used as a Phase-3 gate check. */
export function assertNoSecrets(text: string): void {
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      throw new Error(`Unredacted secret-shaped content found: ${pattern}`);
    }
  }
}
