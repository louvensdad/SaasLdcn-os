'use client';

import { AlertTriangle, Loader2, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useActiveLlm } from '@/hooks/use-active-llm';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/cn';

type EngineState = 'checking' | 'ready' | 'failed' | 'not_configured';

const TONE_CLASSES: Record<EngineState, string> = {
  checking: 'border-[color:var(--border)] text-[color:var(--muted)]',
  ready: 'border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[color:var(--success)]',
  failed: 'border-[color-mix(in_srgb,var(--danger)_32%,transparent)] text-[color:var(--danger)]',
  not_configured: 'border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-[color:var(--warning)]',
};

const DOT_CLASSES: Record<EngineState, string> = {
  checking: 'bg-[color:var(--muted)]',
  ready: 'bg-[color:var(--success)]',
  failed: 'bg-[color:var(--danger)]',
  not_configured: 'bg-[color:var(--warning)]',
};

/** Global, ambient AI-connection status (Topbar). Repointed post-BYOK: this
 * used to read generic system-presence telemetry unrelated to whether the
 * CURRENT USER has a working LLM key -- now it reflects that directly via
 * useActiveLlm(), which is what actually determines whether an agent run
 * will use real AI or the deterministic fallback. */
export function SystemStatusIndicator() {
  const { t } = useLocale();
  const { isReady, isFailed, isLoading, openProviderSettings } = useActiveLlm();

  const state: EngineState = isLoading ? 'checking' : isReady ? 'ready' : isFailed ? 'failed' : 'not_configured';
  const label = {
    checking: t('systemStatus.checking'),
    ready: t('systemStatus.ready'),
    failed: t('systemStatus.failed'),
    not_configured: t('systemStatus.notConfigured'),
  }[state];

  return (
    <span className="inline-flex items-center gap-2">
      <Badge className={cn('gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em]', TONE_CLASSES[state])}>
        {state === 'checking' ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
        ) : state === 'failed' ? (
          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
        ) : state === 'not_configured' ? (
          <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
        ) : (
          <span className={cn('status-dot shrink-0', DOT_CLASSES[state])} aria-hidden />
        )}
        <span className="whitespace-nowrap">LDCN ENGINE · {label}</span>
      </Badge>
      {state === 'not_configured' || state === 'failed' ? (
        <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openProviderSettings()}>
          {t('systemStatus.connectAi')}
        </Button>
      ) : null}
    </span>
  );
}
