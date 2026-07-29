import { API_BASE_URL } from '@/lib/api/endpoints';
import { getAccessToken, refreshAccessToken } from '@/lib/api/client';
import type { MarketplaceInstall, MarketplaceItem } from '@contracts/marketplace.contract';

export type { MarketplaceInstall, MarketplaceItem, MarketplaceItemStatus } from '@contracts/marketplace.contract';

const THIRTY_SEC = 30 * 1000;

async function send<T>(path: string, init: RequestInit, allowRefresh = true): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), THIRTY_SEC);
  try {
    const accessToken = getAccessToken();
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(init.headers ?? {}) },
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (res.status === 401 && allowRefresh && (await refreshAccessToken())) {
      return send<T>(path, init, false);
    }
    if (res.status === 204) return null as T;
    const text = await res.text();
    const body: unknown = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(extractError(body, res.status));
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

function extractError(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (typeof record.detail === 'string') return record.detail;
  }
  return `HTTP ${status}`;
}

const jsonInit = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const marketplaceClient = {
  catalog: (search?: string) =>
    send<MarketplaceItem[]>(`/api/marketplace/items${search ? `?search=${encodeURIComponent(search)}` : ''}`, jsonInit('GET')),
  mine: () => send<MarketplaceItem[]>('/api/marketplace/items/mine', jsonInit('GET')),
  detail: (itemId: string) => send<MarketplaceItem>(`/api/marketplace/items/${encodeURIComponent(itemId)}`, jsonInit('GET')),
  publish: (payload: { source_automation_id: string; name: string; description: string; license: string }) =>
    send<MarketplaceItem>('/api/marketplace/items', jsonInit('POST', payload)),
  archive: (itemId: string) => send<MarketplaceItem>(`/api/marketplace/items/${encodeURIComponent(itemId)}/archive`, jsonInit('POST')),
  republish: (itemId: string, note: string) =>
    send<MarketplaceItem>(`/api/marketplace/items/${encodeURIComponent(itemId)}/republish`, jsonInit('POST', { note })),
  install: (itemId: string) => send<MarketplaceInstall>(`/api/marketplace/items/${encodeURIComponent(itemId)}/install`, jsonInit('POST')),
  myInstalls: () => send<MarketplaceInstall[]>('/api/marketplace/installs/mine', jsonInit('GET')),
  uninstall: (installId: string) =>
    send<MarketplaceInstall>(`/api/marketplace/installs/${encodeURIComponent(installId)}/uninstall`, jsonInit('POST')),
};
