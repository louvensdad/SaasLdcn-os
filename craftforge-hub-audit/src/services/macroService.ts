import { apiClient } from './apiClient'
import type { MacroResponse, CreateMacroRequest, UpdateMacroRequest } from '@/types/api'

const BASE = '/macros'

export const macroService = {
  list: () => apiClient.get<MacroResponse[]>(BASE),
  getById: (id: string) => apiClient.get<MacroResponse>(`${BASE}/${id}`),
  create: (data: CreateMacroRequest) => apiClient.post<MacroResponse>(BASE, data),
  update: (id: string, data: UpdateMacroRequest) => apiClient.put<MacroResponse>(`${BASE}/${id}`, data),
  delete: (id: string) => apiClient.delete<void>(`${BASE}/${id}`),
  associate: (macroId: string, accountIds: string[]) =>
    apiClient.post<void>(`${BASE}/${macroId}/associate`, { account_ids: accountIds }),
  execute: (macroId: string, instanceId: string) =>
    apiClient.post<{ execution_log_id: string }>(`${BASE}/${macroId}/execute`, { instance_id: instanceId }),
}