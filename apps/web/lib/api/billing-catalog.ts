import { API_BASE_URL } from '@/lib/api/endpoints';
import { getAccessToken, refreshAccessToken } from '@/lib/api/client';
import type {
  PlanAccessErrorDetail,
  PlanView,
  SubscribeRequest,
  SubscriptionView,
  TrialView,
} from '@contracts/billing-catalog.contract';

export type { PlanAccessErrorDetail, PlanView, SubscriptionView, TrialView } from '@contracts/billing-catalog.contract';

export class PlanAccessError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(detail: PlanAccessErrorDetail) {
    super(detail.message);
    this.code = detail.code;
    this.details = detail.details;
  }
}

async function send<T>(path: string, init: RequestInit, allowRefresh = true): Promise<T> {
  const accessToken = getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(init.headers ?? {}) },
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401 && allowRefresh && (await refreshAccessToken())) {
    return send<T>(path, init, false);
  }
  if (res.status === 204) return null as T;
  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 403 && body && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail;
      if (detail && typeof detail === 'object' && 'code' in detail && 'correlation_id' in detail) {
        throw new PlanAccessError(detail as PlanAccessErrorDetail);
      }
    }
    const detail = body && typeof body === 'object' && 'detail' in body ? (body as { detail: unknown }).detail : `HTTP ${res.status}`;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return body as T;
}

const jsonInit = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const billingCatalogClient = {
  plans: () => send<PlanView[]>('/api/billing/plans', jsonInit('GET')),
  trial: () => send<TrialView | null>('/api/billing/trial', jsonInit('GET')),
  subscription: (organizationId?: string) =>
    send<SubscriptionView | null>(`/api/billing/subscription${organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : ''}`, jsonInit('GET')),
  subscribe: (payload: SubscribeRequest) => send<SubscriptionView>('/api/billing/subscription', jsonInit('POST', payload)),
  cancel: (organizationId?: string) =>
    send<SubscriptionView | null>(`/api/billing/subscription/cancel${organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : ''}`, jsonInit('POST')),
};
