import { API_BASE_URL } from '@/lib/api/endpoints';
import { getAccessToken, refreshAccessToken } from '@/lib/api/client';
import type { StudentVerificationView, SubmitStudentVerificationRequest } from '@contracts/student-eligibility.contract';

export type { StudentVerificationView } from '@contracts/student-eligibility.contract';

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
  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = body && typeof body === 'object' && 'detail' in body ? (body as { detail: unknown }).detail : `HTTP ${res.status}`;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return body as T;
}

export const studentEligibilityClient = {
  get: () => send<StudentVerificationView | null>('/api/billing/student/verification', { method: 'GET' }),
  submit: (payload: SubmitStudentVerificationRequest) =>
    send<StudentVerificationView>('/api/billing/student/verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
};
