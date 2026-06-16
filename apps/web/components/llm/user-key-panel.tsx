'use client';

import { useEffect, useState } from 'react';
import { KeyRound, Loader2, ShieldCheck, Trash2 } from 'lucide-react';

import { userKeysClient, type KeyProvider, type KeySessionStatus } from '@/lib/api/user-keys';
import { useLocale } from '@/hooks/use-locale';

const PROVIDERS: ReadonlyArray<{ id: KeyProvider; label: string }> = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'google', label: 'Google' },
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

  useEffect(() => {
    if (!enabled) return;
    void userKeysClient.status().then((r) => setSessions(r.sessions)).catch(() => undefined);
  }, [enabled]);

  async function save() {
    if (apiKey.trim().length < 8) return;
    setBusy(true);
    setError(null);
    try {
      const res = await userKeysClient.setKey(provider, apiKey.trim());
      setSessions(res.sessions);
      setApiKey(''); // drop the raw key from component state immediately
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
          className="h-4 w-4 accent-indigo-600"
        />
        <KeyRound className="h-4 w-4 text-indigo-500" />
        {t('userKey.useMyKey')}
      </label>

      {enabled && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            {t('userKey.securityNote')}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as KeyProvider)}
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
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t('userKey.placeholder')}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none ring-indigo-500/40 transition focus:ring-2"
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || apiKey.trim().length < 8}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {t('userKey.save')}
            </button>
          </div>

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
