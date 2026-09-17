import type { AuthResponse } from '@contracts/auth.contract';

/**
 * The one fetch path of the new app, ported from apps/web/lib/api/http.ts and client.ts.
 * Requests go to this app's own origin (`/api/*`); next.config.ts forwards them to the backend, so the refresh cookie
 * stays first-party. The access token lives only in memory; the httpOnly refresh cookie is what survives a reload.
 */

export const DEFAULT_TIMEOUT_MS = 15_000;
export const LONG_TIMEOUT_MS = 5 * 60 * 1000;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: readonly unknown[];
  readonly offline: boolean;

  constructor(init: { message: string; status: number; code: string; details?: readonly unknown[]; offline?: boolean }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details ?? [];
    this.offline = init.offline ?? false;
  }
}

let accessToken: string | null = null;
let refreshing: Promise<AuthResponse | null> | null = null;
let sessionEnded: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function hasAccessToken(): boolean {
  return accessToken !== null;
}

/** The streaming reader needs the same bearer the fetch path sends. */
export function getAccessToken(): string | null {
  return accessToken;
}

/** Called when the session cannot be renewed any more (refresh answered 401 while a session existed). */
export function onSessionEnded(handler: (() => void) | null): void {
  sessionEnded = handler;
}

/** Renews the session from the refresh cookie. Concurrent callers share one request. */
export function refreshSession(): Promise<AuthResponse | null> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as AuthResponse;
      accessToken = payload.tokens.access_token;
      return payload;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export interface ApiOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Serialized as JSON. */
  readonly body?: unknown;
  readonly timeoutMs?: number;
  /** Auth endpoints answer 401 for wrong credentials; those must not try to renew a session. */
  readonly refreshOn401?: boolean;
  readonly signal?: AbortSignal;
}

function describeError(body: unknown, status: number): { message: string; code: string; details: readonly unknown[] } {
  const fallback = { message: `HTTP ${status}`, code: `http_${status}`, details: [] as unknown[] };
  if (!body || typeof body !== 'object') return fallback;
  const record = body as Record<string, unknown>;
  const envelope = record.error;
  if (envelope && typeof envelope === 'object') {
    const inner = envelope as Record<string, unknown>;
    if (typeof inner.message === 'string') {
      return {
        message: inner.message,
        code: typeof inner.code === 'string' ? inner.code : fallback.code,
        details: Array.isArray(inner.details) ? inner.details : [],
      };
    }
  }
  if (typeof record.detail === 'string') return { ...fallback, message: record.detail };
  if (Array.isArray(record.detail)) return { ...fallback, details: record.detail };
  if (typeof record.message === 'string') return { ...fallback, message: record.message };
  return fallback;
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  const text = await response.text();
  return text ? { message: text } : null;
}

async function send(path: string, options: ApiOptions): Promise<Response> {
  if (!path.startsWith('/api/')) throw new Error(`API paths start with /api/ (got ${path})`);
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  options.signal?.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    return await fetch(path, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (caught) {
    const aborted = caught instanceof DOMException && caught.name === 'AbortError';
    throw new ApiError({
      status: 0,
      code: aborted ? 'timeout' : 'network_error',
      message: aborted ? `No answer after ${Math.round(timeoutMs / 1000)} s` : 'The server could not be reached',
      offline: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  let response = await send(path, options);
  if (response.status === 401 && options.refreshOn401 !== false) {
    const hadSession = accessToken !== null;
    const renewed = await refreshSession();
    if (renewed) {
      response = await send(path, options);
    } else if (hadSession) {
      accessToken = null;
      sessionEnded?.();
    }
  }
  const body = await readBody(response);
  if (!response.ok) throw new ApiError({ status: response.status, ...describeError(body, response.status) });
  return body as T;
}

/** A file the backend serves behind the bearer: fetched, not linked, because a plain link carries no token. */
export async function apiBlob(path: string): Promise<Blob> {
  let response = await send(path, { timeoutMs: LONG_TIMEOUT_MS });
  if (response.status === 401) {
    const renewed = await refreshSession();
    if (renewed) response = await send(path, { timeoutMs: LONG_TIMEOUT_MS });
  }
  if (!response.ok) throw new ApiError({ status: response.status, code: 'download_failed', message: `HTTP ${response.status}` });
  return response.blob();
}

export function query(params: Readonly<Record<string, string | number | boolean | null | undefined>>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}
