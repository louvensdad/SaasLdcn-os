'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { DeleteResourceButton } from '@/components/ui/delete-resource-button';
import { RetentionSelect, formatRemaining } from '@/components/settings/retention-select';
import { userKeysClient, type KeyProvider, type KeySessionStatus } from '@/lib/api/user-keys';
import { llmSettingsClient } from '@/lib/api/llm-settings';
import { LLM_BUY_TOKENS_URL } from '@/lib/llm-provider-links';
import type { LlmProviderId } from '@contracts/llm-settings.contract';
import { useLocale } from '@/hooks/use-locale';

export interface AiProviderDef {
  readonly id: KeyProvider | 'ollama';
  readonly name: string;
  readonly description: string;
  readonly keyless?: boolean;
}

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly def: AiProviderDef;
  readonly session?: KeySessionStatus;
  readonly isDefault: boolean;
}

/** Per-provider configuration dialog: the same real key-management flow the
 * old inline cards had (test -> save with TTL -> remove, make default), now
 * behind each provider row's gear button to match the reference layout. */
export function AiProviderKeyDialog({ open, onClose, def, session, isDefault }: Props) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [key, setKey] = useState('');
  const [ttlSeconds, setTtlSeconds] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; model?: string | null } | null>(null);
  const masked = session?.masked;
  const hasKey = Boolean(masked);

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
    <Modal open={open} onClose={onClose} title={def.name} description={def.description}>
      <div className="space-y-4">
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
            />
            <div className="flex flex-wrap gap-2">
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
          isDefault ? (
            <Badge tone="accent">{t('settings.ai.defaultProvider')}</Badge>
          ) : (
            <Button variant="ghost" loading={makeDefault.isPending} onClick={() => makeDefault.mutate()}>
              {t('settings.ai.makeDefault')}
            </Button>
          )
        ) : null}

        {testResult ? (
          <p className={testResult.ok ? 'flex items-center gap-1.5 ds-caption text-[color:var(--success)]' : 'flex items-center gap-1.5 ds-caption text-[color:var(--danger)]'} role="status">
            {testResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {testResult.message}{testResult.model ? ` — ${testResult.model}` : ''}
          </p>
        ) : null}
        {save.isError ? (
          <p className="ds-caption text-[color:var(--danger)]" role="alert">{t('settings.ai.providerError')}</p>
        ) : null}
      </div>
    </Modal>
  );
}
