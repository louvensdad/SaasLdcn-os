import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { macroService } from '@/services/macroService'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import type { CreateMacroRequest, UpdateMacroRequest, ApiError } from '@/types/api'

export function useMacros() {
  return useQuery({
    queryKey: ['macros'],
    queryFn: () => macroService.list(),
  })
}

export function useMacro(id: string) {
  return useQuery({
    queryKey: ['macros', id],
    queryFn: () => macroService.getById(id),
    enabled: !!id,
  })
}

export function useCreateMacro() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data: CreateMacroRequest) => macroService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['macros'] })
      toast.success(t('macros_create_success'))
    },
    onError: (err: ApiError) => {
      toast.error(err.message || t('macros_create_error_validation'))
    },
  })
}

export function useUpdateMacro() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateMacroRequest }) => macroService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['macros'] })
      toast.success('Macro atualizada.')
    },
    onError: (err: ApiError) => {
      toast.error(err.message)
    },
  })
}

export function useDeleteMacro() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => macroService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['macros'] })
      toast.success(t('macros_delete_success'))
    },
    onError: (err: ApiError) => {
      toast.error(err.message)
    },
  })
}

export function useAssociateMacro() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ macroId, accountIds }: { macroId: string; accountIds: string[] }) =>
      macroService.associate(macroId, accountIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['macros'] })
      toast.success(t('macros_associate_success'))
    },
    onError: (err: ApiError) => {
      toast.error(err.message)
    },
  })
}

export function useExecuteMacro() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ macroId, instanceId }: { macroId: string; instanceId: string }) =>
      macroService.execute(macroId, instanceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logs'] })
      toast.success(t('macros_execute_success'))
    },
    onError: (err: ApiError) => {
      toast.error(err.message || t('macros_execute_error'))
    },
  })
}