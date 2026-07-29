import { apiClient } from './apiClient'
import type { ExecutionLogResponse } from '@/types/api'

const BASE = '/logs'

export interface LogFilters {
  instance_id?: string
  macro_id?: string
  result?: 'success' | 'failure'
  date_from?: string
  date_to?: string
  search?: string
}

export const logService = {
  list: (filters?: LogFilters) => apiClient.get<ExecutionLogResponse[]>(BASE, filters as Record<string, unknown>),
  getById: (id: string) => apiClient.get<ExecutionLogResponse>(`${BASE}/${id}`),
}