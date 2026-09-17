'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { Notice, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { useI18n } from '@/lib/i18n/i18n';

export function RuntimeConfigScreen() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const config = useQuery({ queryKey: ['runtime-config'], queryFn: api.runtimeConfig, retry: false });
  const [form, setForm] = useState({ workerLimit: 0, executionTimeoutMinutes: 0, logRetentionDays: 0 });

  useEffect(() => {
    if (config.data) setForm({
      workerLimit: config.data.workerLimit,
      executionTimeoutMinutes: config.data.executionTimeoutMinutes,
      logRetentionDays: config.data.logRetentionDays,
    });
  }, [config.data]);

  const save = useMutation({
    mutationFn: () => api.saveRuntimeConfig(form),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['runtime-config'] }),
  });

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.platform')}</span></div>
          <h1 className="title">{t('config.title')}</h1>
          <p className="lede">{t('config.lede')}</p>
        </div>
      </div>

      {config.isPending ? <Skeleton lines={4} /> : null}
      {config.isError ? (
        <StateBlock kind="error" title={t('config.unreadable')}>{t('config.unreadableBody')}</StateBlock>
      ) : null}

      {config.data ? (
        <section className="sec">
          <div className="form-grid">
            {([
              ['workerLimit', 'config.workers', 'config.workersHint'],
              ['executionTimeoutMinutes', 'config.timeout', 'config.timeoutHint'],
              ['logRetentionDays', 'config.retention', 'config.retentionHint'],
            ] as const).map(([key, label, hint]) => (
              <label className="field" key={key}>
                <span className="field-label">{t(label)}</span>
                <input
                  type="number"
                  min={1}
                  value={form[key]}
                  onChange={(event) => setForm({ ...form, [key]: Number(event.target.value) })}
                />
                <span className="hint">{t(hint)}</span>
              </label>
            ))}
          </div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" type="button" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? t('config.saving') : t('config.save')}
            </button>
          </div>
          {save.isError ? <Notice family="fault" title={t('config.failed')}>{String(save.error)}</Notice> : null}
          {save.isSuccess ? <Notice family="proof" title={t('config.saved')} /> : null}
          <p className="meta" style={{ marginTop: 10 }}>{t('config.note')}</p>
          <Source>GET · PUT /api/runtime/config</Source>
        </section>
      ) : null}
    </>
  );
}
