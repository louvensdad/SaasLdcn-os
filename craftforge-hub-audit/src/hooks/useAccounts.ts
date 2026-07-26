import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { accountService } from '@/services/accountService'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import type { CreateAccountRequest, UpdateAccountRequest, ApiError } from '@/types/api'

export function useAccounts() {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountService.list(),
  })
}

export function useAccount(id: string) {
  return useQuery({
    queryKey: ['accounts', id],
    queryFn: () => accountService.getById(id),
    enabled: !!id,
  })
}

export function useCreateAccount() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data: CreateAccountRequest) => accountService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      toast.success(t('accounts_add_success'))
    },
    onError: (err: ApiError) => {
      toast.error(err.message || t('accounts_add_error_validation'))
    },
  })
}

export function useUpdateAccount() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAccountRequest }) => accountService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Conta atualizada.')
    },
    onError: (err: ApiError) => {
      toast.error(err.message)
    },
  })
}

export function useDeleteAccount() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (id: string) => accountService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      toast.success(t('accounts_delete_success'), {
        duration: 5000,
      })
    },
    onError: (err: ApiError) => {
      toast.error(err.message)
    },
  })
}