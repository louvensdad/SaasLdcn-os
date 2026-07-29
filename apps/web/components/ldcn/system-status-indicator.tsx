'use client';

import { AlertTriangle, Loader2, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useActiveLlm } from '@/hooks/use-active-llm';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/cn';

type EngineState = 'initializing' | 'available' | 'provider_unavailable' | 'not_configured' | 'auth_error';

const TONE_CLASSES: Record<EngineState, string> = {
  initializing: 'border-[color:var(--border)] text-[color:var(--muted)]',
  available: 'border-[color-mix(in_srgb,var(--success)_30%,transparent)] text-[color:var(--success)]',
  provider_unavailable: 'border-[color-mix(in_srgb,var(--danger)_32%,transparent)] text-[color:var(--danger)]',
  auth_error: 'border-[color-mix(in_srgb,var(--danger)_32%,transparent)] text-[color:var(--danger)]',
  not_configured: 'border-[color-mix(in_srgb,var(--warning)_30%,transparent)] text-[color:var(--warning)]',
};

const DOT_CLASSES: Record<EngineState, string> = {
  initializing: 'bg-[color:var(--muted)]',
  available: 'bg-[color:var(--success)]',
  provider_unavailable: 'bg-[color:var(--danger)]',
  auth_error: 'bg-[color:var(--danger)]',
  not_configured: 'bg-[color:var(--warning)]',
};

/** Global, ambient AI-connection status (Topbar). Repointed post-BYOK: this
 * used to read generic system-presence telemetry unrelated to whether the
 * CURRENT USER has a working LLM key -- now it reflects that directly via
 * useActiveLlm(), which is what actually determines whether an agent run
 * will use real AI or the deterministic fallback. */
export function SystemStatusIndicator() {
  const { t } = useLocale();
  const { status, isReady, isLoading, openProviderSettings } = useActiveLlm();

  const state: EngineState = isLoading ? 'initializing' : isReady ? 'available' : status === 'auth_error' ? 'auth_error' : status === 'unavailable' ? 'provider_unavailable' : 'not_configured';
  const label = {
    initializing: 'Inicializando',
    available: 'Disponível',
    provider_unavailable: 'Provider indisponível',
    not_configured: 'Nenhuma API configurada',
    auth_error: 'Erro de autenticação',
  }[state];

  return (
    <span className="inline-flex items-center gap-2">
      <Badge className={cn('gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em]', TONE_CLASSES[state])}>
        {state === 'initializing' ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
        ) : state === 'provider_unavailable' || state === 'auth_error' ? (
          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
        ) : state === 'not_configured' ? (
          <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
        ) : (
          <span className={cn('status-dot shrink-0', DOT_CLASSES[state])} aria-hidden />
        )}
        <span className="whitespace-nowrap">{t('systemStatus.engineBadge', { status: label })}</span>
      </Badge>
      {state === 'not_configured' || state === 'provider_unavailable' || state === 'auth_error' ? (
        <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openProviderSettings()}>
          {t('systemStatus.connectAi')}
        </Button>
      ) : null}
    </span>
  );
}
