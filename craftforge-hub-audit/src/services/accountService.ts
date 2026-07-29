import { apiClient } from './apiClient'
import type { AccountResponse, CreateAccountRequest, UpdateAccountRequest } from '@/types/api'

const BASE = '/accounts'

export const accountService = {
  list: () => apiClient.get<AccountResponse[]>(BASE),
  getById: (id: string) => apiClient.get<AccountResponse>(`${BASE}/${id}`),
  create: (data: CreateAccountRequest) => apiClient.post<AccountResponse>(BASE, data),
  update: (id: string, data: UpdateAccountRequest) => apiClient.put<AccountResponse>(`${BASE}/${id}`, data),
  delete: (id: string) => apiClient.delete<void>(`${BASE}/${id}`),
}