'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ExternalLink, KeyRound, ServerCog } from 'lucide-react';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CardLoading } from '@/components/feedback/loading-system';
import { DeleteResourceButton } from '@/components/ui/delete-resource-button';
import { RetentionSelect, formatRemaining } from '@/components/settings/retention-select';
import { SettingsSection } from '@/components/settings/settings-section';
import { SettingsMetricCard } from '@/components/settings/settings-metric-card';
import { userKeysClient, type KeyProvider, type KeySessionStatus, type KeySessionStatusResponse } from '@/lib/api/user-keys';
import { llmSettingsClient } from '@/lib/api/llm-settings';
import { LLM_BUY_TOKENS_URL } from '@/lib/llm-provider-links';
import type { ActiveLlmSettings, LlmCacheStats, LlmProviderId } from '@contracts/llm-settings.contract';
import { useLocale } from '@/hooks/use-locale';

type ProviderId = KeyProvider | 'ollama';

interface ProviderDef {
  readonly id: ProviderId;
  readonly name: string;
  readonly description: string;
  readonly keyless?: boolean;
}

// Only the providers the platform actually supports. DeepSeek/Llama/Qwen are
// reachable through OpenRouter (no first-class key), so they are not separate
// cards — surfacing them would imply functionality that doesn't exist.
const PROVIDERS: readonly ProviderDef[] = [
  { id: 'anthropic', name: 'Claude', description: 'Anthropic — Opus, Sonnet, Haiku, Fable.' },
  { id: 'openai', name: 'OpenAI', description: 'GPT-4.1, o4-mini.' },
  { id: 'google', name: 'Gemini', description: 'Gemini 2.5 Pro / Flash.' },
  { id: 'openrouter', name: 'OpenRouter', description: 'Many models behind one key — DeepSeek, Llama, Qwen…' },
  { id: 'deepseek', name: 'DeepSeek', description: 'DeepSeek first-class API — Chat (V3) and Reasoner (R1).' },
  { id: 'custom', name: 'Custom', description: 'Any OpenAI-compatible endpoint (vLLM, LM Studio, Together…).' },
  { id: 'ollama', name: 'Ollama', description: 'Local open-source models on your machine.', keyless: true },
];

export function AiProvidersTab() {
  const { t } = useLocale();
  const statusQuery = useQuery<KeySessionStatusResponse>({
    queryKey: ['user-ai-keys'],
    queryFn: () => userKeysClient.status(),
    staleTime: 30_000,
    retry: 1,
  });
  const activeQuery = useQuery<ActiveLlmSettings>({
    queryKey: ['llm-settings', 'active'],
    queryFn: llmSettingsClient.active,
    staleTime: 30_000,
  });
  const cacheStatsQuery = useQuery<LlmCacheStats>({
    queryKey: ['llm-settings', 'cache-stats'],
    queryFn: llmSettingsClient.cacheStats,
    staleTime: 30_000,
  });
  const sessions = statusQuery.data?.sessions ?? [];

  return (
    <div className="space-y-6">
      <SettingsSection title={t('settings.ai.title')} description={t('settings.ai.description')}>
        {statusQuery.isLoading ? (
          <div className="grid gap-4 lg:grid-cols-2"><CardLoading /><CardLoading /></div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {PROVIDERS.map((provider) => (
              <ProviderKeyCard
                key={provider.id}
                def={provider}
                session={sessions.find((item) => item.provider === provider.id)}
                isDefault={activeQuery.data?.provider === provider.id}
              />
            ))}
          </div>
        )}
      </SettingsSection>

      {activeQuery.data ? (
        <SettingsSection title={t('settings.ai.policyTitle')} description={t('settings.ai.policyDescription')}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SettingsMetricCard
              label={t('settings.ai.policyDefaultProvider')}
              value={activeQuery.data.providerLabel ?? activeQuery.data.provider ?? t('common.unavailable')}
            />
            <SettingsMetricCard label={t('settings.ai.policyDefaultModel')} value={activeQuery.data.model ?? t('common.unavailable')} />
            <SettingsMetricCard label={t('settings.ai.policyStatus')} value={t(`settings.ai.policyStatusValue.${activeQuery.data.status}`)} />
            <SettingsMetricCard
              label={t('settings.ai.policyLastValidated')}
              value={activeQuery.data.lastValidatedAt ? new Date(activeQuery.data.lastValidatedAt).toLocaleString() : t('common.never')}
            />
          </div>
        </SettingsSection>
      ) : null}

      {cacheStatsQuery.data ? (
        <SettingsSection title={t('settings.ai.cacheTitle')} description={t('settings.ai.cacheDescription')}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SettingsMetricCard label={t('settings.ai.cacheHits')} value={String(cacheStatsQuery.data.hits)} />
            <SettingsMetricCard label={t('settings.ai.cacheMisses')} value={String(cacheStatsQuery.data.misses)} />
            <SettingsMetricCard label={t('settings.ai.cacheEntries')} value={String(cacheStatsQuery.data.entries)} />
            <SettingsMetricCard label={t('settings.ai.cacheEvicted')} value={String(cacheStatsQuery.data.evicted)} />
          </div>
        </SettingsSection>
      ) : null}
    </div>
  );
}

function ProviderKeyCard({ def, session, isDefault }: { readonly def: ProviderDef; readonly session?: KeySessionStatus; readonly isDefault: boolean }) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [key, setKey] = useState('');
  const [ttlSeconds, setTtlSeconds] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; model?: string | null } | null>(null);
  const masked = session?.masked;
  const hasKey = Boolean(masked);
  const status: 'active' | 'none' | 'local' = def.keyless ? 'local' : hasKey ? 'active' : 'none';
  const tone: BadgeTone = status === 'active' ? 'success' : status === 'local' ? 'accent' : 'neutral';
  const dotColor = status === 'active' ? 'var(--success)' : status === 'local' ? 'var(--accent)' : 'var(--muted-2)';

  const test = useMutation({
    mutationFn: () => userKeysClient.testKey(def.id as KeyProvider, key.trim()),
    onSuccess: (result) => setTestResult({ ok: result.ok, message: result.message, model: result.model }),
    onError: (caught) => setTestResult({ ok: false, message: caught instanceof Error ? caught.message : t('settings.ai.providerError') }),
  });
  const save = useMutation({
    mutationFn: () => userKeysClient.setKey(def.id as KeyProvider, key.trim(), ttlSeconds),
    onSuccess: () => {
      setKey('');
      setTestResult(null);
      void queryClient.invalidateQueries({ queryKey: ['user-ai-keys'] });
    },
  });
  const remove = useMutation({
    mutationFn: () => userKeysClient.remove(def.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['user-ai-keys'] });
      void queryClient.invalidateQueries({ queryKey: ['llm-settings', 'active'] });
    },
  });
  const makeDefault = useMutation({
    mutationFn: () => llmSettingsClient.select(def.id as LlmProviderId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['llm-settings', 'active'] }),
  });

  return (
    <div className="glass noise relative overflow-hidden p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)]"
            style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}
          >
            {def.keyless ? <ServerCog className="h-5 w-5" aria-hidden /> : <KeyRound className="h-5 w-5" aria-hidden />}
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[color:var(--text)]">{def.name}</h3>
            <p className="mt-0.5 ds-caption">{def.description}</p>
          </div>
        </div>
        <Badge tone={tone}>
          <span className="live-dot mr-1.5" style={{ background: dotColor }} aria-hidden />
          {t(`settings.ai.status.${status}`)}
        </Badge>
      </div>

      <div className="mt-4">
        {def.keyless ? (
          <p className="ds-caption">{t('settings.ai.keyless')}</p>
        ) : hasKey ? (
          <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_45%,transparent)] px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="t-mono text-sm text-[color:var(--text)]" aria-label={t('settings.ai.maskedKey')}>{masked}</span>
              <DeleteResourceButton
                title={t('settings.ai.deleteKeyTitle', { provider: def.name })}
                description={t('settings.ai.deleteKeyDescription', { provider: def.name })}
                triggerLabel={t('settings.ai.removeKey')}
                onConfirm={async () => { await remove.mutateAsync(); }}
              />
            </div>
            {session?.expires_in_seconds != null ? (
              <p className="mt-2 ds-caption">
                {t('settings.retention.expiresIn', { time: formatRemaining(session.expires_in_seconds) })}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {LLM_BUY_TOKENS_URL[def.id as KeyProvider] ? (
              <a
                href={LLM_BUY_TOKENS_URL[def.id as KeyProvider]}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 ds-caption text-[color:var(--accent)] hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                {t('settings.ai.buyTokens', { provider: def.name })}
              </a>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                type="password"
                name={`${def.id}-api-key`}
                autoComplete="off"
                spellCheck={false}
                error={save.isError}
                value={key}
                onChange={(event) => { setKey(event.target.value); setTestResult(null); }}
                placeholder={t('settings.ai.keyPlaceholder')}
                aria-label={`${def.name} API key`}
                className="flex-1"
              />
              <Button variant="secondary" disabled={!key.trim()} loading={test.isPending} onClick={() => test.mutate()}>
                {test.isPending ? t('settings.ai.testing') : t('settings.ai.testKey')}
              </Button>
              <Button variant="primary" disabled={!key.trim() || !testResult?.ok} loading={save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? t('settings.ai.saving') : t('settings.ai.setKey')}
              </Button>
            </div>
            <RetentionSelect
              value={ttlSeconds}
              onChange={setTtlSeconds}
              defaultOptionLabel={t('settings.retention.keyDefault')}
              disabled={save.isPending}
              className="max-w-xs"
            />
          </div>
        )}
        {(hasKey || def.keyless) && def.id !== 'custom' ? (
          <div className="mt-3">
            {isDefault ? (
              <Badge tone="accent">{t('settings.ai.defaultProvider')}</Badge>
            ) : (
              <Button variant="ghost" loading={makeDefault.isPending} onClick={() => makeDefault.mutate()}>
                {t('settings.ai.makeDefault')}
              </Button>
            )}
          </div>
        ) : null}
        {testResult ? (
          <p className={testResult.ok ? 'mt-2 flex items-center gap-1.5 ds-caption text-[color:var(--success)]' : 'mt-2 flex items-center gap-1.5 ds-caption text-[color:var(--danger)]'} role="status">
            {testResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {testResult.message}{testResult.model ? ` ? ${testResult.model}` : ''}
          </p>
        ) : null}
        {save.isError ? (
          <p className="mt-2 ds-caption text-[color:var(--danger)]" role="alert">{t('settings.ai.providerError')}</p>
        ) : null}
      </div>
    </div>
  );
}
