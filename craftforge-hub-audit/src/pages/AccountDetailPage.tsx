import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAccount, useUpdateAccount } from '@/hooks/useAccounts'
import { useInstances } from '@/hooks/useInstanceStatus'
import { Spinner } from '@/components/common/Spinner'
import { Badge } from '@/components/common/Badge'
import { ArrowLeft, PencilSimple } from '@phosphor-icons/react'
import { useState, useEffect } from 'react'
import { Modal } from '@/components/common/Modal'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { UpdateAccountRequest } from '@/types/api'

const updateSchema = z.object({
  username: z.string().min(1, 'validation_required').optional(),
  game: z.string().min(1, 'validation_required').optional(),
})

export function AccountDetailPage() {
  const { accountId } = useParams<{ accountId: string }>()
  const { t } = useTranslation()
  const { data: account, isLoading } = useAccount(accountId!)
  const { data: instances } = useInstances()
  const updateAccount = useUpdateAccount()
  const [showEdit, setShowEdit] = useState(false)

  const accountInstances = instances?.filter((i) => i.account_id === accountId) || []

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateAccountRequest>({
    resolver: zodResolver(updateSchema),
  })

  useEffect(() => {
    if (account) {
      reset({ username: account.username, game: account.game })
    }
  }, [account, reset])

  const onSubmit = (data: UpdateAccountRequest) => {
    updateAccount.mutate(
      { id: accountId!, data },
      { onSuccess: () => setShowEdit(false) },
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-xl">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!account) {
    return <p className="text-text-secondary">{t('common_error')}</p>
  }

  return (
    <div className="max-w-2xl mx-auto space-y-lg">
      <Link to="/accounts" className="flex items-center gap-xs text-text-secondary hover:text-primary transition-colors text-body">
        <ArrowLeft size={16} />
        {t('common_back')}
      </Link>

      <div className="card p-lg">
        <div className="flex items-center justify-between mb-md">
          <h1 className="font-heading text-heading font-bold text-text-primary">{t('accounts_detail_title')}</h1>
          <button className="btn-secondary flex items-center gap-sm" onClick={() => setShowEdit(true)}>
            <PencilSimple size={16} />
            {t('common_edit')}
          </button>
        </div>
        <div className="space-y-sm">
          <div className="flex gap-md">
            <span className="text-text-secondary text-body w-24">{t('accounts_username_label')}:</span>
            <span className="text-text-primary">{account.username}</span>
          </div>
          <div className="flex gap-md">
            <span className="text-text-secondary text-body w-24">{t('accounts_game_label')}:</span>
            <span className="text-text-primary">{account.game}</span>
          </div>
          <div className="flex gap-md">
            <span className="text-text-secondary text-body w-24">Status:</span>
            <Badge variant={account.status === 'active' ? 'online' : 'offline'}>
              {account.status === 'active' ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
        </div>
      </div>

      <div className="card p-lg">
        <h2 className="font-heading text-subheading font-semibold text-text-primary mb-md">{t('accounts_detail_instances')}</h2>
        {accountInstances.length > 0 ? (
          <div className="space-y-sm">
            {accountInstances.map((inst) => (
              <Link
                key={inst.id}
                to={`/instances/${inst.id}`}
                className="flex items-center justify-between p-sm rounded-md hover:bg-neutral/20 transition-colors"
              >
                <span className="text-body text-text-primary">{inst.account_username}</span>
                <Badge variant={inst.status === 'online' ? 'online' : 'offline'}>
                  {inst.status === 'online' ? t('instances_online') : t('instances_offline')}
                </Badge>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-text-muted text-body">{t('instances_empty')}</p>
        )}
      </div>

      <Modal open={showEdit} onOpenChange={setShowEdit} title={t('accounts_edit')}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-md">
          <div>
            <label className="block text-body text-text-secondary mb-xs">{t('accounts_username_label')}</label>
            <input className="input-field w-full" {...register('username')} />
            {errors.username && <p className="text-error text-caption mt-xs">{t(errors.username.message as string)}</p>}
          </div>
          <div>
            <label className="block text-body text-text-secondary mb-xs">{t('accounts_game_label')}</label>
            <input className="input-field w-full" {...register('game')} />
            {errors.game && <p className="text-error text-caption mt-xs">{t(errors.game.message as string)}</p>}
          </div>
          <button type="submit" className="btn-primary w-full flex items-center justify-center gap-sm" disabled={updateAccount.isPending}>
            {updateAccount.isPending && <Spinner size="sm" />}
            {t('common_save')}
          </button>
        </form>
      </Modal>
    </div>
  )
}