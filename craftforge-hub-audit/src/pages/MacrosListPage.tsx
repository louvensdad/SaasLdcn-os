import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMacros, useDeleteMacro, useCreateMacro } from '@/hooks/useMacros'
import { Modal } from '@/components/common/Modal'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { SkeletonTable } from '@/components/common/SkeletonCard'
import { Spinner } from '@/components/common/Spinner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, PencilSimple, Trash, Play, Scroll } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'

const macroSchema = z.object({
  name: z.string().min(1, 'validation_required'),
  script: z.string().min(1, 'validation_required'),
})

type MacroFormData = z.infer<typeof macroSchema>

export function MacrosListPage() {
  const { t } = useTranslation()
  const { data: macros, isLoading } = useMacros()
  const deleteMacro = useDeleteMacro()
  const createMacro = useCreateMacro()
  const [showCreate, setShowCreate] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MacroFormData>({
    resolver: zodResolver(macroSchema),
  })

  const onSubmit = (data: MacroFormData) => {
    createMacro.mutate(data, {
      onSuccess: () => {
        setShowCreate(false)
        reset()
      },
    })
  }

  if (isLoading) {
    return (
      <div>
        <h1 className="font-heading text-heading font-bold text-text-primary mb-lg">{t('macros_title')}</h1>
        <SkeletonTable rows={4} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-lg">
        <h1 className="font-heading text-heading font-bold text-text-primary">{t('macros_title')}</h1>
        <button className="btn-primary flex items-center gap-sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} />
          {t('macros_create')}
        </button>
      </div>

      {macros && macros.length > 0 ? (
        <div className="space-y-sm">
          {macros.map((macro) => (
            <div key={macro.id} className="card-hover p-md flex items-center justify-between">
              <div className="flex-1">
                <Link to={`/macros/${macro.id}`} className="text-body font-medium text-text-primary hover:text-primary transition-colors">
                  {macro.name}
                </Link>
                <p className="text-caption text-text-muted truncate max-w-md">{macro.script.substring(0, 80)}...</p>
              </div>
              <div className="flex items-center gap-sm">
                <Link to={`/macros/${macro.id}`} className="btn-secondary p-xs" title={t('macros_edit')}>
                  <PencilSimple size={16} />
                </Link>
                <button className="btn-danger p-xs" onClick={() => setDeleteId(macro.id)} title={t('macros_delete')}>
                  <Trash size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Scroll size={48} />}
          title={t('macros_empty')}
          action={
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              {t('macros_empty_action')}
            </button>
          }
        />
      )}

      <Modal open={showCreate} onOpenChange={setShowCreate} title={t('macros_create')}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-md">
          <div>
            <label className="block text-body text-text-secondary mb-xs">{t('macros_name_label')}</label>
            <input className="input-field w-full" {...register('name')} />
            {errors.name && <p className="text-error text-caption mt-xs">{t(errors.name.message as string)}</p>}
          </div>
          <div>
            <label className="block text-body text-text-secondary mb-xs">{t('macros_script_label')}</label>
            <textarea
              className="input-field w-full h-32 resize-none"
              {...register('script')}
              placeholder={t('macros_script_placeholder')}
            />
            {errors.script && <p className="text-error text-caption mt-xs">{t(errors.script.message as string)}</p>}
          </div>
          <button type="submit" className="btn-primary w-full flex items-center justify-center gap-sm" disabled={createMacro.isPending}>
            {createMacro.isPending && <Spinner size="sm" />}
            {t('common_save')}
          </button>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title={t('macros_delete')}
        description={t('macros_delete_confirm')}
        onConfirm={() => {
          if (deleteId) {
            deleteMacro.mutate(deleteId)
            setDeleteId(null)
          }
        }}
        loading={deleteMacro.isPending}
      />
    </div>
  )
}