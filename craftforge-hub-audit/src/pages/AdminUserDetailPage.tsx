// Placeholder — full implementation similar to AdminUsersListPage inline modal
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Users } from '@phosphor-icons/react'

export function AdminUserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const { t } = useTranslation()

  return (
    <div className="max-w-2xl mx-auto">
      <Link to="/admin/users" className="flex items-center gap-xs text-text-secondary hover:text-primary transition-colors text-body mb-lg">
        <ArrowLeft size={16} />
        {t('common_back')}
      </Link>
      <div className="card p-lg">
        <h1 className="font-heading text-heading font-bold text-text-primary mb-md">
          <Users size={24} className="inline mr-sm text-accent" />
          {t('admin_users_edit_title')} — {userId}
        </h1>
        <p className="text-text-secondary">{t('admin_users_empty')}</p>
      </div>
    </div>
  )
}