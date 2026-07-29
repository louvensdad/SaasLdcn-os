import { API_BASE_URL } from '@/lib/api/endpoints';
import { getAccessToken, refreshAccessToken } from '@/lib/api/client';
import type {
  ApiCollectionResponse,
  GeneratedEndpointsResponse,
} from '@contracts/api-collection.contract';
import type { GenerationSurface } from '@/lib/api/generated-export';

export type { ApiCollectionResponse, GeneratedEndpointsResponse };

async function request<T>(path: string, allowRefresh = true): Promise<T> {
  const accessToken = getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401 && allowRefresh && await refreshAccessToken()) {
    return request<T>(path, false);
  }
  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(extractError(body, res.status));
  }
  return body as T;
}

function extractError(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const detail = (body as Record<string, unknown>).detail;
    if (typeof detail === 'string') return detail;
  }
  return `HTTP ${status}`;
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export const apiCollectionClient = {
  endpoints: (surface: GenerationSurface, projectId: string) =>
    request<GeneratedEndpointsResponse>(`/api/${surface}/${projectId}/endpoints`),
  collection: (surface: GenerationSurface, projectId: string, format: 'postman' | 'insomnia') =>
    request<ApiCollectionResponse>(`/api/${surface}/${projectId}/api-collection?format=${format}`),
  download: async (surface: GenerationSurface, projectId: string, format: 'postman' | 'insomnia') => {
    const response = await apiCollectionClient.collection(surface, projectId, format);
    downloadJson(response.filename, response.collection);
  },
};
