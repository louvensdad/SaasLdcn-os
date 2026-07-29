import axios, { AxiosError, type AxiosRequestConfig } from 'axios'
import { env } from '@/env'
import type { ApiError } from '@/types/api'

const client = axios.create({ baseURL: env.apiUrl })

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ detail?: string; code?: string }>) => {
    const apiError: ApiError = {
      status: error.response?.status ?? 0,
      code: error.response?.data?.code ?? 'request_failed',
      message: error.response?.data?.detail ?? error.message,
    }
    return Promise.reject(apiError)
  },
)

export const apiClient = {
  async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    return (await client.get<T>(url, { params })).data
  },
  async post<T>(url: string, data?: unknown): Promise<T> {
    return (await client.post<T>(url, data)).data
  },
  async put<T>(url: string, data?: unknown): Promise<T> {
    return (await client.put<T>(url, data)).data
  },
  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return (await client.delete<T>(url, config)).data
  },
}
