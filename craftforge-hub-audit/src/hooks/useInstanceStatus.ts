import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { instanceService } from '@/services/instanceService'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import type { ApiError } from '@/types/api'

export function useInstances() {
  return useQuery({
    queryKey: ['instances'],
    queryFn: () => instanceService.list(),
  })
}

export function useInstance(id: string) {
  return useQuery({
    queryKey: ['instances', id],
    queryFn: () => instanceService.getById(id),
    enabled: !!id,
  })
}

export function useStartInstance() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => instanceService.start(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
    onError: (err: ApiError) => {
      toast.error(err.message || t('instances_start_error_limit'))
    },
  })
}

export function useStopInstance() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => instanceService.stop(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      toast.success(t('instances_stop_success'))
    },
    onError: (err: ApiError) => {
      toast.error(err.message)
    },
  })
}

export function useStartAllInstances() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: () => instanceService.startAll(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      toast.success(t('instances_start_all_success'))
      if (data.errors?.length) {
        data.errors.forEach((e) => toast.error(e))
      }
    },
    onError: (err: ApiError) => {
      toast.error(err.message)
    },
  })
}