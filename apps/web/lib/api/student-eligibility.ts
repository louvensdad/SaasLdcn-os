import { API_BASE_URL } from '@/lib/api/endpoints';
import { getAccessToken, refreshAccessToken } from '@/lib/api/client';
import type { StudentVerificationView } from '@contracts/student-eligibility.contract';

export type { StudentVerificationView } from '@contracts/student-eligibility.contract';

export class StudentDocumentError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function structuredDetail(body: unknown): { code: string; message: string } | null {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (detail && typeof detail === 'object' && 'code' in detail && 'message' in detail) {
      return detail as { code: string; message: string };
    }
  }
  return null;
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
  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = structuredDetail(body);
    if (detail) throw new StudentDocumentError(detail.code, detail.message);
    throw new Error(`HTTP ${res.status}`);
  }
  return body as T;
}

/** Real multipart upload via XHR (not fetch) so onProgress reflects actual
 * bytes sent -- fetch has no cross-browser upload-progress event. Retries
 * once on 401 with a refreshed access token, same policy as send() above. */
function uploadStudentDocument(file: File, onProgress: (percent: number) => void, allowRefresh = true): Promise<StudentVerificationView> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/api/billing/student/verification`);
    xhr.withCredentials = true;
    const accessToken = getAccessToken();
    if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new Error('network_error'));
    xhr.onload = () => {
      void (async () => {
        if (xhr.status === 401 && allowRefresh && (await refreshAccessToken())) {
          try {
            resolve(await uploadStudentDocument(file, onProgress, false));
          } catch (caught) {
            reject(caught);
          }
          return;
        }
        let body: unknown = null;
        try {
          body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch {
          // fall through with body = null
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(body as StudentVerificationView);
          return;
        }
        const detail = structuredDetail(body);
        reject(detail ? new StudentDocumentError(detail.code, detail.message) : new Error(`HTTP ${xhr.status}`));
      })();
    };
    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}

async function fetchStudentDocument(): Promise<Blob> {
  const accessToken = getAccessToken();
  const res = await fetch(`${API_BASE_URL}/api/billing/student/verification/document`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

export const studentEligibilityClient = {
  get: () => send<StudentVerificationView | null>('/api/billing/student/verification', { method: 'GET' }),
  submit: uploadStudentDocument,
  document: fetchStudentDocument,
};
