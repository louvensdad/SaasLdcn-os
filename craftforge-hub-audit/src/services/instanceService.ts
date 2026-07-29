import { apiClient } from './apiClient'
import type { InstanceResponse } from '@/types/api'

const BASE = '/instances'

export const instanceService = {
  list: () => apiClient.get<InstanceResponse[]>(BASE),
  getById: (id: string) => apiClient.get<InstanceResponse>(`${BASE}/${id}`),
  start: (id: string) => apiClient.post<InstanceResponse>(`${BASE}/${id}/start`),
  stop: (id: string) => apiClient.post<InstanceResponse>(`${BASE}/${id}/stop`),
  startAll: () => apiClient.post<{ started: number; errors: string[] }>(`${BASE}/start`),
  stopAll: () => apiClient.post<void>(`${BASE}/stop`),
}