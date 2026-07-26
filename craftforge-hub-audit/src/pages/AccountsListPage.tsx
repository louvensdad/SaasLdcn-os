import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccounts, useDeleteAccount, useCreateAccount } from '@/hooks/useAccounts'
import { Modal } from '@/components/common/Modal'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { SkeletonTable } from '@/components/common/SkeletonCard'
import { Spinner } from '@/components/common/Spinner'
import { Badge } from '@/components/common/Badge'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, PencilSimple, Trash, Users } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'

const accountSchema = z.object({
  username: z.string().min(1, 'validation_required'),
  password: z.string().min(1, 'validation_required'),
  game: z.string().min(1, 'validation_required'),
})

type AccountFormData = z.infer<typeof accountSchema>

export function AccountsListPage() {
  const { t } = useTranslation()
  const { data: accounts, isLoading } = useAccounts()
  const deleteAccount = useDeleteAccount()
  const createAccount = useCreateAccount()
  const [showCreate, setShowCreate] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [toastUndo, setToastUndo] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
  })

  const onSubmit = (data: AccountFormData) => {
    createAccount.mutate(data, {
      onSuccess: () => {
        setShowCreate(false)
        reset()
      },
    })
  }

  const handleDelete = () => {
    if (!deleteId) return
    deleteAccount.mutate(deleteId, {
      onSuccess: () => {
        setDeleteId(null)
        setToastUndo(deleteId)
        setTimeout(() => setToastUndo(null), 5000)
      },
    })
  }

  if (isLoading) {
    return (
      <div>
        <h1 className="font-heading text-heading font-bold text-text-primary mb-lg">{t('accounts_title')}</h1>
        <SkeletonTable rows={4} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-lg">
        <h1 className="font-heading text-heading font-bold text-text-primary">{t('accounts_title')}</h1>
        <button className="btn-primary flex items-center gap-sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} />
          {t('accounts_add')}
        </button>
      </div>

      {accounts && accounts.length > 0 ? (
        <div className="space-y-sm">
          {accounts.map((acc) => (
            <div key={acc.id} className="card-hover p-md flex items-center justify-between">
              <div>
                <Link to={`/accounts/${acc.id}`} className="text-body font-medium text-text-primary hover:text-primary transition-colors">
                  {acc.username}
                </Link>
                <p className="text-caption text-text-muted">{acc.game}</p>
              </div>
              <div className="flex items-center gap-sm">
                <Badge variant={acc.status === 'active' ? 'online' : 'offline'}>
                  {acc.status === 'active' ? 'Ativo' : 'Inativo'}
                </Badge>
                <Link to={`/accounts/${acc.id}`} className="btn-secondary p-xs" title={t('accounts_edit')}>
                  <PencilSimple size={16} />
                </Link>
                <button className="btn-danger p-xs" onClick={() => setDeleteId(acc.id)} title={t('accounts_delete')}>
                  <Trash size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Users size={48} />}
          title={t('accounts_empty')}
          action={
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              {t('accounts_empty_action')}
            </button>
          }
        />
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onOpenChange={setShowCreate} title={t('accounts_add')}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-md">
          <div>
            <label className="block text-body text-text-secondary mb-xs">{t('accounts_username_label')}</label>
            <input className="input-field w-full" {...register('username')} />
            {errors.username && <p className="text-error text-caption mt-xs">{t(errors.username.message as string)}</p>}
          </div>
          <div>
            <label className="block text-body text-text-secondary mb-xs">{t('accounts_password_label')}</label>
            <input type="password" className="input-field w-full" {...register('password')} />
            {errors.password && <p className="text-error text-caption mt-xs">{t(errors.password.message as string)}</p>}
          </div>
          <div>
            <label className="block text-body text-text-secondary mb-xs">{t('accounts_game_label')}</label>
            <input className="input-field w-full" {...register('game')} />
            {errors.game && <p className="text-error text-caption mt-xs">{t(errors.game.message as string)}</p>}
          </div>
          <button type="submit" className="btn-primary w-full flex items-center justify-center gap-sm" disabled={createAccount.isPending}>
            {createAccount.isPending && <Spinner size="sm" />}
            {t('common_save')}
          </button>
        </form>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title={t('accounts_delete')}
        description={t('accounts_delete_confirm')}
        onConfirm={handleDelete}
        loading={deleteAccount.isPending}
      />
    </div>
  )
}