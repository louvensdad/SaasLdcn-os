'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { DeleteResourceButton } from '@/components/ui/delete-resource-button';
import { aiKeyVaultClient, type AiKeyView, type KeyProvider } from '@/lib/api/ai-key-vault';
import { LLM_BUY_TOKENS_URL } from '@/lib/llm-provider-links';
import { useLocale } from '@/hooks/use-locale';

export interface AiProviderDef {
  readonly id: KeyProvider;
  readonly name: string;
  readonly description: string;
  readonly keyless?: boolean;
}

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly def: AiProviderDef;
  readonly keys: readonly AiKeyView[];
}

/** Per-provider key management dialog: a permanent, named, multi-key registry
 * (vault 68 - Gestão de Chaves de IA). Lists every registered key for this
 * provider with its own default/delete controls, plus an add-form below. */
export function AiProviderKeyDialog({ open, onClose, def, keys }: Props) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [nome, setNome] = useState('');
  const [apelido, setApelido] = useState('');
  const [key, setKey] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; model?: string | null } | null>(null);

  const invalidateKeys = () => {
    void queryClient.invalidateQueries({ queryKey: ['user-ai-keys'] });
    void queryClient.invalidateQueries({ queryKey: ['llm-settings', 'active'] });
  };

  const test = useMutation({
    mutationFn: () => aiKeyVaultClient.testKey(def.id, key.trim()),
    onSuccess: (result) => setTestResult({ ok: result.ok, message: result.message, model: result.model }),
    onError: (caught) => setTestResult({ ok: false, message: caught instanceof Error ? caught.message : t('settings.ai.providerError') }),
  });
  const create = useMutation({
    mutationFn: () => aiKeyVaultClient.create(def.id, nome.trim(), key.trim(), apelido.trim() || undefined),
    onSuccess: () => {
      setNome(''); setApelido(''); setKey(''); setTestResult(null);
      invalidateKeys();
    },
  });
  const remove = useMutation({
    mutationFn: (keyId: string) => aiKeyVaultClient.remove(keyId),
    onSuccess: invalidateKeys,
  });
  const setDefault = useMutation({
    mutationFn: (keyId: string) => aiKeyVaultClient.setDefault(keyId),
    onSuccess: invalidateKeys,
  });

  return (
    <Modal open={open} onClose={onClose} title={def.name} description={def.description}>
      <div className="space-y-4">
        {def.keyless ? (
          <p className="ds-caption">{t('settings.ai.keyless')}</p>
        ) : (
          <>
            {keys.length > 0 ? (
              <ul className="space-y-2">
                {keys.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_45%,transparent)] px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[color:var(--text)]">{row.nome}</p>
                        <p className="t-mono text-xs text-[color:var(--muted)]">
                          {row.masked}{row.apelido ? ` · ${row.apelido}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {row.is_default ? (
                          <Badge tone="accent">{t('settings.ai.defaultProvider')}</Badge>
                        ) : (
                          <Button variant="ghost" loading={setDefault.isPending} onClick={() => setDefault.mutate(row.id)}>
                            {t('settings.ai.setAsDefault')}
                          </Button>
                        )}
                        <DeleteResourceButton
                          title={t('settings.ai.deleteKeyTitle', { provider: row.nome })}
                          description={t('settings.ai.deleteKeyDescription', { provider: def.name })}
                          triggerLabel={t('settings.ai.removeKey')}
                          onConfirm={async () => { await remove.mutateAsync(row.id); }}
                        />
                      </div>
                    </div>
                    <p className="mt-1.5 ds-caption">
                      {t('settings.ai.createdAt', { date: new Date(row.created_at).toLocaleDateString() })}
                      {row.last_used_at ? ` · ${t('settings.ai.lastUsedAt', { date: new Date(row.last_used_at).toLocaleDateString() })}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ds-caption">{t('settings.ai.noKeysForProvider')}</p>
            )}

            <div className="space-y-3 border-t border-[color:var(--border)] pt-3">
              {LLM_BUY_TOKENS_URL[def.id] ? (
                <a
                  href={LLM_BUY_TOKENS_URL[def.id]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 ds-caption text-[color:var(--accent)] hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  {t('settings.ai.buyTokens', { provider: def.name })}
                </a>
              ) : null}
              <Input
                name={`${def.id}-key-name`}
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                placeholder={t('settings.ai.keyNamePlaceholder')}
                aria-label={t('settings.ai.keyName')}
              />
              <Input
                name={`${def.id}-key-nickname`}
                value={apelido}
                onChange={(event) => setApelido(event.target.value)}
                placeholder={t('settings.ai.keyNicknamePlaceholder')}
                aria-label={t('settings.ai.keyNickname')}
              />
              <Input
                type="password"
                name={`${def.id}-api-key`}
                autoComplete="off"
                spellCheck={false}
                error={create.isError}
                value={key}
                onChange={(event) => { setKey(event.target.value); setTestResult(null); }}
                placeholder={t('settings.ai.keyPlaceholder')}
                aria-label={`${def.name} API key`}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={!key.trim()} loading={test.isPending} onClick={() => test.mutate()}>
                  {test.isPending ? t('settings.ai.testing') : t('settings.ai.testKey')}
                </Button>
                <Button
                  variant="primary"
                  disabled={!key.trim() || !nome.trim() || !testResult?.ok}
                  loading={create.isPending}
                  onClick={() => create.mutate()}
                >
                  {create.isPending ? t('settings.ai.saving') : t('settings.ai.addKey')}
                </Button>
              </div>
            </div>
          </>
        )}

        {testResult ? (
          <p className={testResult.ok ? 'flex items-center gap-1.5 ds-caption text-[color:var(--success)]' : 'flex items-center gap-1.5 ds-caption text-[color:var(--danger)]'} role="status">
            {testResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {testResult.message}{testResult.model ? ` — ${testResult.model}` : ''}
          </p>
        ) : null}
        {create.isError ? (
          <p className="ds-caption text-[color:var(--danger)]" role="alert">{t('settings.ai.providerError')}</p>
        ) : null}
      </div>
    </Modal>
  );
}
