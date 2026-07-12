'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, KeyRound, Loader2, ShieldCheck, Trash2 } from 'lucide-react';

import { userKeysClient, type KeyProvider, type KeySessionStatus } from '@/lib/api/user-keys';
import { LLM_BUY_TOKENS_URL } from '@/lib/llm-provider-links';
import { useLocale } from '@/hooks/use-locale';

const PROVIDERS: ReadonlyArray<{ id: KeyProvider; label: string }> = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'google', label: 'Google' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'custom', label: 'Custom (OpenAI-compat)' },
];

interface Props {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}

/**
 * "Use my own LLM key" panel. The key is sent only to the ephemeral server-side
 * vault (never stored in the browser, never logged, never echoed back). Shows the
 * masked status of active key sessions and lets the user remove them.
 */
export function UserKeyPanel({ enabled, onEnabledChange }: Props) {
  const { t } = useLocale();
  const [provider, setProvider] = useState<KeyProvider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [sessions, setSessions] = useState<KeySessionStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; model?: string | null } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    void userKeysClient.status().then((r) => setSessions(r.sessions)).catch(() => undefined);
  }, [enabled]);

  async function testKey() {
    if (apiKey.trim().length < 8) return;
    setBusy(true);
    setError(null);
    try {
      const result = await userKeysClient.testKey(provider, apiKey.trim());
      setTestResult({ ok: result.ok, message: result.message, model: result.model });
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : t('userKey.error.save') });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (apiKey.trim().length < 8) return;
    setBusy(true);
    setError(null);
    try {
      const res = await userKeysClient.setKey(provider, apiKey.trim());
      setSessions(res.sessions);
      setApiKey(''); // drop the raw key from component state immediately
      setTestResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('userKey.error.save'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: string) {
    setBusy(true);
    try {
      await userKeysClient.remove(p);
      const res = await userKeysClient.status();
      setSessions(res.sessions);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-4">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          className="h-4 w-4 accent-[color:var(--accent)]"
        />
        <KeyRound className="h-4 w-4 text-[color:var(--accent)]" />
        {t('userKey.useMyKey')}
      </label>

      {enabled && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            {t('userKey.securityNote')}
          </p>

          {!sessions.some((s) => s.provider === provider) && LLM_BUY_TOKENS_URL[provider] ? (
            <a
              href={LLM_BUY_TOKENS_URL[provider]}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-[color:var(--accent)] hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              {t('settings.ai.buyTokens', { provider: PROVIDERS.find((p) => p.id === provider)?.label ?? provider })}
            </a>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={provider}
              onChange={(e) => { setProvider(e.target.value as KeyProvider); setTestResult(null); }}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
              placeholder={t('userKey.placeholder')}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none ring-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition focus:ring-2"
            />
            <button
              type="button"
              onClick={() => void testKey()}
              disabled={busy || apiKey.trim().length < 8}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition hover:bg-background/60 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Testar chave
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || apiKey.trim().length < 8 || !testResult?.ok}
              className="inline-flex items-center gap-2 rounded-lg bg-[image:var(--accent-gradient)] px-3 py-1.5 text-sm font-medium text-[color:var(--accent-foreground)] transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {t('userKey.save')}
            </button>
          </div>

          {testResult && (
            <p className={testResult.ok ? 'flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400' : 'flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400'}>
              {testResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              {testResult.message}{testResult.model ? ` ? ${testResult.model}` : ''}
            </p>
          )}
          {error && <p className="text-xs text-amber-600 dark:text-amber-400">{error}</p>}

          {sessions.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {sessions.map((s) => (
                <li key={s.provider} className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="font-medium">{s.provider}</span>
                  <code className="text-xs text-muted-foreground">{s.masked}</code>
                  <button
                    type="button"
                    onClick={() => void remove(s.provider)}
                    className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t('userKey.remove')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
