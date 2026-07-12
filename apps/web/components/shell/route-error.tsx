'use client';

import { useEffect } from 'react';
import { RefreshCcw, RotateCcw } from 'lucide-react';

import { useLocale } from '@/hooks/use-locale';

// Stale JS chunk after a deploy (client still holds an old bundle hash) throws
// here as a ChunkLoadError. `reset()` only re-renders the segment with the
// bundle already in memory, so it can't fix that — a full reload is required.
// Guarded by sessionStorage so a genuinely broken page can't reload-loop.
const CHUNK_ERROR_PATTERN = /Loading chunk|ChunkLoadError|failed to fetch dynamically imported module/i;
const RELOAD_GUARD_KEY = 'ldcn-error-boundary-reload';

export function RouteError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  const { t } = useLocale();

  useEffect(() => {
    console.error('[route-error]', error);

    if (CHUNK_ERROR_PATTERN.test(error.message) && !window.sessionStorage.getItem(RELOAD_GUARD_KEY)) {
      window.sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
      window.location.reload();
    }
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <div className="w-full max-w-md space-y-4 rounded-[var(--radius-xl)] border border-[color:var(--border)] bg-[color:var(--control-bg)] p-8 text-center">
        <h1 className="ds-card-title">{t('shell.error.title')}</h1>
        <p className="ds-body-sm text-[color:var(--muted)]">{t('shell.error.description')}</p>
        {error.digest ? (
          <p className="ds-metadata">{t('shell.error.digest', { digest: error.digest })}</p>
        ) : null}
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="focus-ring inline-flex items-center gap-2 rounded-full bg-[color:var(--accent)] px-4 py-2 text-sm font-semibold text-[color:var(--accent-foreground)]"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            {t('shell.error.retry')}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="focus-ring inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] px-4 py-2 text-sm font-semibold text-[color:var(--text)]"
          >
            <RefreshCcw className="h-4 w-4" aria-hidden />
            {t('shell.error.reload')}
          </button>
        </div>
      </div>
    </div>
  );
}
