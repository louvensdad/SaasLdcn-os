'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Signal } from '@/components/signal';
import { Badge, Kv, Failure, Notice, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatCount, formatUsd, formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';

const PROVIDERS = ['openai', 'anthropic', 'google', 'deepseek', 'groq'] as const;

/* One <option> carries a provider and a model; neither can contain this. */
const SEPARATOR = ' \u00b7\u00b7 ';

export function AiSettingsScreen() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ provider: 'deepseek', nome: '', api_key: '', modelo_padrao: '' });

  const active = useQuery({ queryKey: ['llm-active'], queryFn: api.llmActive, retry: false });
  const keys = useQuery({ queryKey: ['ai-keys'], queryFn: api.aiKeys, retry: false });
  const usage = useQuery({ queryKey: ['llm-usage'], queryFn: api.llmUsage, retry: false });
  const byModel = useQuery({ queryKey: ['llm-usage-by-model'], queryFn: api.llmUsageByModel, retry: false });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['ai-keys'] });
    void queryClient.invalidateQueries({ queryKey: ['llm-active'] });
  };
  const add = useMutation({
    mutationFn: () => api.addAiKey({ provider: form.provider, nome: form.nome.trim(), api_key: form.api_key, modelo_padrao: form.modelo_padrao.trim() || undefined }),
    onSuccess: () => { setForm({ ...form, nome: '', api_key: '', modelo_padrao: '' }); refresh(); },
  });
  const setDefault = useMutation({ mutationFn: (keyId: string) => api.setDefaultAiKey(keyId), onSuccess: refresh });
  /* Which model answers is a real setting the backend takes; the screen used to show it and offer no way
     to change it. The choices are only what this account's own keys carry -- REDESIGN.md §3.5: never
     invent the names of available models. */
  const activeChoice = active.data?.provider ? `${active.data.provider}${SEPARATOR}${active.data.model ?? ''}` : '';
  const [choice, setChoice] = useState<string | null>(null);
  const selected = choice ?? activeChoice;
  const dirty = selected !== activeChoice;
  /* Every distinct provider+model this account holds a key for, and nothing else. A key with no default
     model still offers its provider, because the backend accepts a provider with a null model. */
  const modelChoices = useMemo(() => {
    const seen = new Map<string, string>();
    for (const key of keys.data?.keys ?? []) {
      const model = key.modelo_padrao?.trim() ?? '';
      const value = `${key.provider}${SEPARATOR}${model}`;
      if (!seen.has(value)) seen.set(value, model ? `${key.provider} \u00b7 ${model}` : key.provider);
    }
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [keys.data]);

  const setActive = useMutation({
    mutationFn: () => {
      const [provider, model] = selected ? selected.split(SEPARATOR) : [null, null];
      return api.setActiveLlm({ provider: provider || null, model: model || null });
    },
    onSuccess: () => { setChoice(null); refresh(); },
  });
  const test = useMutation({ mutationFn: (keyId: string) => api.testAiKey(keyId), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (keyId: string) => api.deleteAiKey(keyId), onSuccess: refresh });

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.settings')}</span></div>
          <h1 className="title">{t('settings.ai.title')}</h1>
          <p className="lede">{t('settings.ai.lede')}</p>
        </div>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('settings.ai.active.title')}</h2>
          {active.data ? <Badge value={active.data.status} family={familyFor(active.data.status)} /> : null}
        </div>
        {active.isPending ? <Skeleton lines={3} /> : null}
        {active.data ? (
          <>
            <Kv
              pairs={[
                [t('settings.ai.provider'), <span key="p" className="mono">{active.data.providerLabel ?? active.data.provider ?? '—'}</span>],
                [t('settings.ai.model'), <span key="m" className="mono">{active.data.model ?? '—'}</span>],
                [t('settings.ai.mode'), <Badge key="md" value={active.data.mode} family={active.data.mode === 'llm' ? 'proof' : 'idle'} />],
                [t('settings.ai.validated'), active.data.lastValidatedAt
                  ? `${formatWhen(active.data.lastValidatedAt, locale)}${active.data.validationIsStale ? ` · ${t('settings.ai.stale', { days: active.data.validationAgeDays ?? 0 })}` : ''}`
                  : t('settings.ai.neverValidated')],
                [t('settings.ai.context'), active.data.contextTokens ? formatCount(active.data.contextTokens, locale) : '—'],
                [t('settings.ai.reason'), active.data.reason],
              ]}
            />
            <Source>GET /api/llm/settings/active</Source>
          </>
        ) : null}

        {keys.data ? (
          <div className="stack" style={{ marginTop: 16, maxWidth: 520 }}>
            <label className="field">
              <span className="field-label">{t('settings.ai.active.choose')}</span>
              <select value={selected} onChange={(event) => setChoice(event.target.value)} disabled={setActive.isPending}>
                <option value="">{t('settings.ai.active.platform')}</option>
                {modelChoices.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <span className="hint">{modelChoices.length > 0 ? t('settings.ai.active.hint') : t('settings.ai.active.noKeys')}</span>
            </label>
            <div className="btn-row">
              <button className="btn btn-primary" type="button" disabled={setActive.isPending || !dirty} onClick={() => setActive.mutate()}>
                {setActive.isPending ? t('settings.ai.active.applying') : t('settings.ai.active.apply')}
              </button>
            </div>
            {setActive.isError ? <Failure title={t('settings.ai.active.failed')} error={setActive.error} onRetry={() => setActive.mutate()} /> : null}
            <Source>PUT /api/llm/settings/active</Source>
          </div>
        ) : null}
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('settings.ai.keys.title')}</h2>
          <span className="meta">{t('settings.ai.keys.meta', { count: keys.data?.keys.length ?? 0 })}</span>
        </div>
        {keys.isPending ? <Skeleton lines={4} /> : null}
        {keys.isError ? <StateBlock kind="error" title={t('settings.ai.keys.unreadable')} /> : null}
        {keys.data && keys.data.keys.length === 0 ? (
          <StateBlock kind="empty" title={t('settings.ai.keys.none')}>{t('settings.ai.keys.noneBody')}</StateBlock>
        ) : null}
        {keys.data && keys.data.keys.length > 0 ? (
          <div className="list">
            {keys.data.keys.map((key) => (
              <div className="li" key={key.id}>
                <Signal family={familyFor(key.status)} label={key.nome} />
                <span className="li-title">{key.nome} {key.is_default ? <Badge value="DEFAULT" family="proof" /> : null}</span>
                <span className="meta">
                  <span className="mono">{key.masked}</span>
                </span>
                <span className="li-sub">
                  <span className="mono">{key.provider}{key.modelo_padrao ? ` · ${key.modelo_padrao}` : ''} · {key.status}</span>
                  {key.validation_is_stale ? ` · ${t('settings.ai.stale', { days: key.validation_age_days ?? 0 })}` : ''}
                  {' · '}
                  <button className="btn btn-quiet btn-sm" type="button" disabled={test.isPending} onClick={() => test.mutate(key.id)}>{t('settings.ai.keys.test')}</button>
                  {' '}
                  {key.is_default ? null : (
                    <button className="btn btn-quiet btn-sm" type="button" disabled={setDefault.isPending} onClick={() => setDefault.mutate(key.id)}>{t('settings.ai.keys.setDefault')}</button>
                  )}
                  {' '}
                  <button className="btn btn-quiet btn-sm" type="button" disabled={remove.isPending} onClick={() => remove.mutate(key.id)}>{t('settings.ai.keys.delete')}</button>
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {test.data ? <Notice family={test.data.ok ? 'proof' : 'fault'} title={t('settings.ai.keys.tested')}>{test.data.message}</Notice> : null}
        <Source>GET /api/user-ai-keys · POST …/test · POST …/set-default · DELETE …</Source>
      </section>

      <section className="sec">
        <div className="sec-head"><h2 className="h-sec">{t('settings.ai.add.title')}</h2></div>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">{t('settings.ai.add.provider')}</span>
            <select value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value })}>
              {PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">{t('settings.ai.add.name')}</span>
            <input value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} placeholder={t('settings.ai.add.namePlaceholder')} />
          </label>
          <label className="field">
            <span className="field-label">{t('settings.ai.add.key')}</span>
            <input type="password" autoComplete="off" value={form.api_key} onChange={(event) => setForm({ ...form, api_key: event.target.value })} />
            <span className="hint">{t('settings.ai.add.keyHint')}</span>
          </label>
          <label className="field">
            <span className="field-label">{t('settings.ai.add.model')}</span>
            <input value={form.modelo_padrao} onChange={(event) => setForm({ ...form, modelo_padrao: event.target.value })} placeholder="deepseek-chat" />
          </label>
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" type="button" disabled={add.isPending || !form.nome.trim() || !form.api_key} onClick={() => add.mutate()}>
            {add.isPending ? t('settings.ai.add.saving') : t('settings.ai.add.save')}
          </button>
        </div>
        {add.isError ? <Failure title={t('settings.ai.add.failed')} error={add.error} onRetry={() => add.mutate()} /> : null}
        <p className="meta" style={{ marginTop: 10 }}>{t('settings.ai.add.note')}</p>
        <Source>POST /api/user-ai-keys</Source>
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('settings.ai.usage.title')}</h2>
          {usage.data ? <span className="meta">{t('command.provider.window', { hours: usage.data.window_hours })}</span> : null}
        </div>
        {usage.isPending ? <Skeleton lines={3} /> : null}
        {usage.data ? (
          <>
            <div className="facts">
              <div className="fact"><span className="label">{t('command.provider.requests')}</span><div className="v num">{formatCount(usage.data.requests, locale)}</div></div>
              <div className="fact"><span className="label">{t('command.provider.tokens')}</span><div className="v num">{formatCount(usage.data.input_tokens, locale)} / {formatCount(usage.data.output_tokens, locale)}</div></div>
              <div className="fact"><span className="label">{t('command.provider.cost')}</span><div className="v num">{formatUsd(usage.data.estimated_cost_usd, locale)}</div></div>
              <div className="fact"><span className="label">{t('settings.ai.usage.saved')}</span><div className="v num">{formatUsd(usage.data.cache_savings_usd, locale)}</div></div>
            </div>
            <p className="meta" style={{ marginTop: 10 }}>{t('command.provider.costNote')}</p>
          </>
        ) : null}
        {byModel.data && byModel.data.length > 0 ? (
          <div className="tbl-wrap" style={{ marginTop: 14 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('settings.ai.usage.model')}</th>
                  <th className="r">{t('command.provider.requests')}</th>
                  <th className="r">{t('settings.ai.usage.latency')}</th>
                  <th className="r">{t('command.provider.cost')}</th>
                  <th className="r">{t('settings.ai.usage.cache')}</th>
                </tr>
              </thead>
              <tbody>
                {byModel.data.map((row) => (
                  <tr key={`${row.provider}-${row.model}`}>
                    <td><strong className="mono">{row.model}</strong><div className="id">{row.provider}</div></td>
                    <td className="r">{formatCount(row.requests, locale)}</td>
                    <td className="r">{row.avg_latency_ms ? `${Math.round(row.avg_latency_ms)} ms` : '—'}</td>
                    <td className="r">{formatUsd(row.estimated_cost_usd, locale)}</td>
                    <td className="r">{Math.round(row.cache_hit_rate * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <Source>GET /api/llm/usage/stats · GET /api/llm/usage/by-model</Source>
      </section>
    </>
  );
}
