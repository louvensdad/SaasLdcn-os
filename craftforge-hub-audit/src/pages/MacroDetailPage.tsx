import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMacro, useUpdateMacro, useExecuteMacro, useAssociateMacro } from '@/hooks/useMacros'
import { useAccounts } from '@/hooks/useAccounts'
import { useInstances } from '@/hooks/useInstanceStatus'
import { Spinner } from '@/components/common/Spinner'
import { Badge } from '@/components/common/Badge'
import { Modal } from '@/components/common/Modal'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { ArrowLeft, PencilSimple, Play, Link as LinkIcon } from '@phosphor-icons/react'
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import * as Checkbox from '@radix-ui/react-checkbox'
import { Check } from '@phosphor-icons/react'
import type { UpdateMacroRequest } from '@/types/api'

const updateSchema = z.object({
  name: z.string().min(1, 'validation_required').optional(),
  script: z.string().min(1, 'validation_required').optional(),
})

export function MacroDetailPage() {
  const { macroId } = useParams<{ macroId: string }>()
  const { t } = useTranslation()
  const { data: macro, isLoading } = useMacro(macroId!)
  const { data: accounts } = useAccounts()
  const { data: instances } = useInstances()
  const updateMacro = useUpdateMacro()
  const executeMacro = useExecuteMacro()
  const associateMacro = useAssociateMacro()
  const [showEdit, setShowEdit] = useState(false)
  const [showAssociate, setShowAssociate] = useState(false)
  const [showExecute, setShowExecute] = useState(false)
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateMacroRequest>({
    resolver: zodResolver(updateSchema),
  })

  useEffect(() => {
    if (macro) {
      reset({ name: macro.name, script: macro.script })
    }
  }, [macro, reset])

  const onSubmit = (data: UpdateMacroRequest) => {
    updateMacro.mutate(
      { id: macroId!, data },
      { onSuccess: () => setShowEdit(false) },
    )
  }

  const handleAssociate = () => {
    if (selectedAccountIds.length === 0) return
    associateMacro.mutate(
      { macroId: macroId!, accountIds: selectedAccountIds },
      { onSuccess: () => { setShowAssociate(false); setSelectedAccountIds([]) } },
    )
  }

  const handleExecute = () => {
    if (!selectedInstanceId) return
    executeMacro.mutate(
      { macroId: macroId!, instanceId: selectedInstanceId },
      { onSuccess: () => setShowExecute(false) },
    )
  }

  const toggleAccount = (id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-xl">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!macro) {
    return <p className="text-text-secondary">{t('common_error')}</p>
  }

  return (
    <div className="max-w-2xl mx-auto space-y-lg">
      <Link to="/macros" className="flex items-center gap-xs text-text-secondary hover:text-primary transition-colors text-body">
        <ArrowLeft size={16} />
        {t('common_back')}
      </Link>

      <div className="card p-lg">
        <div className="flex items-center justify-between mb-md">
          <h1 className="font-heading text-heading font-bold text-text-primary">{t('macros_detail_title')}</h1>
          <div className="flex gap-sm">
            <button className="btn-primary flex items-center gap-sm" onClick={() => setShowExecute(true)}>
              <Play size={16} />
              {t('macros_execute')}
            </button>
            <button className="btn-secondary flex items-center gap-sm" onClick={() => setShowAssociate(true)}>
              <LinkIcon size={16} />
              {t('macros_associate')}
            </button>
            <button className="btn-secondary p-xs" onClick={() => setShowEdit(true)}>
              <PencilSimple size={16} />
            </button>
          </div>
        </div>
        <div className="space-y-sm">
          <div className="flex gap-md">
            <span className="text-text-secondary text-body w-24">{t('macros_name_label')}:</span>
            <span className="text-text-primary">{macro.name}</span>
          </div>
          <div>
            <span className="text-text-secondary text-body block mb-xs">{t('macros_script_label')}:</span>
            <pre className="bg-surface-alt border border-border rounded-md p-sm text-caption text-text-secondary overflow-x-auto max-h-48">
              {macro.script}
            </pre>
          </div>
        </div>
      </div>

      <Modal open={showEdit} onOpenChange={setShowEdit} title={t('macros_edit')}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-md">
          <div>
            <label className="block text-body text-text-secondary mb-xs">{t('macros_name_label')}</label>
            <input className="input-field w-full" {...register('name')} />
            {errors.name && <p className="text-error text-caption mt-xs">{t(errors.name.message as string)}</p>}
          </div>
          <div>
            <label className="block text-body text-text-secondary mb-xs">{t('macros_script_label')}</label>
            <textarea className="input-field w-full h-32 resize-none" {...register('script')} />
            {errors.script && <p className="text-error text-caption mt-xs">{t(errors.script.message as string)}</p>}
          </div>
          <button type="submit" className="btn-primary w-full flex items-center justify-center gap-sm" disabled={updateMacro.isPending}>
            {updateMacro.isPending && <Spinner size="sm" />}
            {t('common_save')}
          </button>
        </form>
      </Modal>

      {/* Associate Modal */}
      <Modal open={showAssociate} onOpenChange={setShowAssociate} title={t('macros_associate')}>
        <div className="space-y-sm max-h-60 overflow-y-auto">
          {accounts?.map((acc) => (
            <label key={acc.id} className="flex items-center gap-sm p-sm rounded-md hover:bg-neutral/20 cursor-pointer">
              <Checkbox.Root
                checked={selectedAccountIds.includes(acc.id)}
                onCheckedChange={() => toggleAccount(acc.id)}
                className="w-4 h-4 border border-neutral rounded data-[state=checked]:bg-primary data-[state=checked]:border-primary flex items-center justify-center"
              >
                <Checkbox.Indicator>
                  <Check size={12} className="text-surface-alt" />
                </Checkbox.Indicator>
              </Checkbox.Root>
              <span className="text-body text-text-primary">{acc.username}</span>
              <span className="text-caption text-text-muted">{acc.game}</span>
            </label>
          ))}
        </div>
        <button
          className="btn-primary w-full mt-md flex items-center justify-center gap-sm"
          onClick={handleAssociate}
          disabled={selectedAccountIds.length === 0 || associateMacro.isPending}
        >
          {associateMacro.isPending && <Spinner size="sm" />}
          {t('macros_associate')} ({selectedAccountIds.length})
        </button>
      </Modal>

      {/* Execute Modal */}
      <Modal open={showExecute} onOpenChange={setShowExecute} title={t('macros_execute')}>
        <div className="space-y-sm">
          <label className="block text-body text-text-secondary mb-xs">{t('instances_title')}</label>
          <select
            className="input-field w-full"
            value={selectedInstanceId}
            onChange={(e) => setSelectedInstanceId(e.target.value)}
          >
            <option value="">Selecione uma instância...</option>
            {instances?.filter((i) => i.status === 'online').map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.account_username} - {inst.game} (Online)
              </option>
            ))}
          </select>
        </div>
        <button
          className="btn-primary w-full mt-md flex items-center justify-center gap-sm"
          onClick={handleExecute}
          disabled={!selectedInstanceId || executeMacro.isPending}
        >
          {executeMacro.isPending && <Spinner size="sm" />}
          {t('macros_execute')}
        </button>
      </Modal>
    </div>
  )
}