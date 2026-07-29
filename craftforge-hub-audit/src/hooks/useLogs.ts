import { useQuery } from '@tanstack/react-query'
import { logService, type LogFilters } from '@/services/logService'
import type { ExecutionLogResponse } from '@/types/api'

export function useLogs(filters?: LogFilters) {
  return useQuery({
    queryKey: ['logs', filters],
    queryFn: () => logService.list(filters),
  })
}

export function useLog(id: string) {
  return useQuery({
    queryKey: ['logs', id],
    queryFn: () => logService.getById(id),
    enabled: !!id,
  })
}