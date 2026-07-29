import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLogin } from '@/hooks/useAuth'
import { Spinner } from '@/components/common/Spinner'
import { GameController } from '@phosphor-icons/react'

const loginSchema = z.object({
  email: z.string().email('validation_email'),
  password: z.string().min(1, 'validation_required'),
})

type LoginFormData = z.infer<typeof loginSchema>

export function LoginPage() {
  const { t } = useTranslation()
  const loginMutation = useLogin()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data)
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="card p-xl">
        <div className="flex flex-col items-center mb-lg">
          <GameController size={40} className="text-primary mb-sm" />
          <h1 className="font-heading text-heading font-bold text-text-primary">{t('login_title')}</h1>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-md">
          <div>
            <label className="block text-body text-text-secondary mb-xs">{t('login_email_label')}</label>
            <input
              type="email"
              className="input-field w-full"
              {...register('email')}
              autoComplete="email"
            />
            {errors.email && (
              <p className="text-error text-caption mt-xs">{t(errors.email.message as string)}</p>
            )}
          </div>
          <div>
            <label className="block text-body text-text-secondary mb-xs">{t('login_password_label')}</label>
            <input
              type="password"
              className="input-field w-full"
              {...register('password')}
              autoComplete="current-password"
            />
            {errors.password && (
              <p className="text-error text-caption mt-xs">{t(errors.password.message as string)}</p>
            )}
          </div>
          <button type="submit" className="btn-primary w-full flex items-center justify-center gap-sm" disabled={loginMutation.isPending}>
            {loginMutation.isPending && <Spinner size="sm" />}
            {t('login_submit')}
          </button>
        </form>
        <p className="mt-lg text-center text-body text-text-secondary">
          {t('login_no_account')}{' '}
          <Link to="/register" className="text-primary hover:underline">
            {t('login_register_link')}
          </Link>
        </p>
      </div>
    </div>
  )
}