import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/services/apiClient'
import { Spinner } from '@/components/common/Spinner'
import { SkeletonTable } from '@/components/common/SkeletonCard'
import { EmptyState } from '@/components/common/EmptyState'
import { Badge } from '@/components/common/Badge'
import { Modal } from '@/components/common/Modal'
import { ShieldCheck, PencilSimple, Users } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import type { UserAdminResponse } from '@/types/api'

export function AdminUsersListPage() {
  const { t } = useTranslation()
  const [showEdit, setShowEdit] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserAdminResponse | null>(null)

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => apiClient.get<UserAdminResponse[]>('/admin/users'),
  })

  if (isLoading) {
    return (
      <div>
        <h1 className="font-heading text-heading font-bold text-text-primary mb-lg">{t('admin_users_title')}</h1>
        <SkeletonTable rows={5} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-lg">
        <h1 className="font-heading text-heading font-bold text-text-primary">{t('admin_users_title')}</h1>
      </div>

      {users && users.length > 0 ? (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-body text-text-secondary">
                <th className="text-left p-sm">{t('admin_users_name')}</th>
                <th className="text-left p-sm">{t('admin_users_email')}</th>
                <th className="text-left p-sm">{t('admin_users_plan')}</th>
                <th className="text-left p-sm">{t('admin_users_instances_limit')}</th>
                <th className="text-left p-sm">{t('admin_users_active_instances')}</th>
                <th className="text-left p-sm">{t('admin_users_role')}</th>
                <th className="text-left p-sm">{t('admin_users_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border hover:bg-neutral/10 transition-colors">
                  <td className="p-sm text-text-primary">{user.name}</td>
                  <td className="p-sm text-text-secondary">{user.email}</td>
                  <td className="p-sm">
                    <Badge variant={user.plan === 'enterprise' ? 'admin' : user.plan === 'pro' ? 'info' : 'offline'}>
                      {t(`common_plan_${user.plan}`)}
                    </Badge>
                  </td>
                  <td className="p-sm text-text-primary font-mono">{user.instances_limit}</td>
                  <td className="p-sm text-text-primary font-mono">{user.active_instances}</td>
                  <td className="p-sm">
                    {user.role === 'admin' ? (
                      <Badge variant="admin">{t('common_role_admin')}</Badge>
                    ) : (
                      <span className="text-text-secondary">{t('common_role_user')}</span>
                    )}
                  </td>
                  <td className="p-sm">
                    <button
                      className="btn-secondary p-xs"
                      onClick={() => {
                        setSelectedUser(user)
                        setShowEdit(true)
                      }}
                    >
                      <PencilSimple size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={<Users size={48} />}
          title={t('admin_users_empty')}
          action={
            <button className="btn-primary">{t('admin_users_empty_action')}</button>
          }
        />
      )}

      {selectedUser && (
        <AdminUserEditModal
          user={selectedUser}
          open={showEdit}
          onOpenChange={setShowEdit}
        />
      )}
    </div>
  )
}

function AdminUserEditModal({
  user,
  open,
  onOpenChange,
}: {
  user: UserAdminResponse
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [plan, setPlan] = useState(user.plan)
  const [limit, setLimit] = useState(String(user.instances_limit))
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    setLoading(true)
    try {
      await apiClient.put(`/admin/users/${user.id}`, {
        plan,
        instances_limit: parseInt(limit, 10),
      })
      onOpenChange(false)
      window.location.reload()
    } catch (err: any) {
      // handled by apiClient
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t('admin_users_edit_title')}>
      <div className="space-y-md">
        <div>
          <label className="block text-body text-text-secondary mb-xs">{t('admin_users_name')}</label>
          <p className="text-text-primary">{user.name}</p>
        </div>
        <div>
          <label className="block text-body text-text-secondary mb-xs">{t('admin_users_plan_label')}</label>
          <select className="input-field w-full" value={plan} onChange={(e) => setPlan(e.target.value as any)}>
            <option value="free">{t('common_plan_free')}</option>
            <option value="pro">{t('common_plan_pro')}</option>
            <option value="enterprise">{t('common_plan_enterprise')}</option>
          </select>
        </div>
        <div>
          <label className="block text-body text-text-secondary mb-xs">{t('admin_users_limit_label')}</label>
          <input
            type="number"
            className="input-field w-full"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            min={user.active_instances}
          />
          {parseInt(limit, 10) < user.active_instances && (
            <p className="text-error text-caption mt-xs">{t('admin_users_update_error')}</p>
          )}
        </div>
        <button
          className="btn-primary w-full flex items-center justify-center gap-sm"
          onClick={handleSave}
          disabled={loading || parseInt(limit, 10) < user.active_instances}
        >
          {loading && <Spinner size="sm" />}
          {t('common_save')}
        </button>
      </div>
    </Modal>
  )
}