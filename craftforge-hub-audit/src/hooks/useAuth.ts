import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'
import { authService } from '@/services/authService'
import { useTranslation } from 'react-i18next'
import type { LoginRequest, RegisterRequest, ApiError } from '@/types/api'

export function useLogin() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data: LoginRequest) => authService.login(data),
    onSuccess: async (tokens) => {
      const user = await authService.me()
      login(user, tokens)
      toast.success(`Bem-vindo, ${user.name}!`)
      navigate('/dashboard')
    },
    onError: (err: ApiError) => {
      toast.error(t('login_error_invalid'))
    },
  })
}

export function useRegister() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (data: RegisterRequest) => authService.register(data),
    onSuccess: () => {
      toast.success(t('register_success'))
      navigate('/login')
    },
    onError: (err: ApiError) => {
      toast.error(err.message || t('register_error_weak_password'))
    },
  })
}

export function useLogout() {
  const logout = useAuthStore((s) => s.logout)
  return () => logout()
}