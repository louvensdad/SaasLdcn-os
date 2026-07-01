'use client';

import { useEffect, useState } from 'react';
import { Download, FileJson, Loader2, Server } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/use-locale';
import {
  apiCollectionClient,
  type GeneratedEndpointsResponse,
} from '@/lib/api/api-collection';
import type { GenerationSurface } from '@/lib/api/generated-export';

interface ApiTestPanelProps {
  readonly surface: GenerationSurface;
  readonly projectId: string;
}

export function ApiTestPanel({ surface, projectId }: ApiTestPanelProps) {
  const { t } = useLocale();
  const [data, setData] = useState<GeneratedEndpointsResponse | null>(null);
  const [busy, setBusy] = useState<null | 'load' | 'postman' | 'insomnia'>('load');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setBusy('load');
    setError(null);
    apiCollectionClient.endpoints(surface, projectId)
      .then((response) => {
        if (active) setData(response);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : t('apiTest.error.load'));
      })
      .finally(() => {
        if (active) setBusy(null);
      });
    return () => {
      active = false;
    };
  }, [surface, projectId]);

  async function download(format: 'postman' | 'insomnia') {
    setBusy(format);
    setError(null);
    try {
      await apiCollectionClient.download(surface, projectId, format);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('apiTest.error.download'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-[color:var(--accent)]" />
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('apiTest.title')}</h3>
        </div>
        <div className="ml-auto flex gap-2">
          <Button type="button" onClick={() => void download('postman')} disabled={busy !== null} className="rounded-xl">
            {busy === 'postman' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {t('apiTest.postman')}
          </Button>
          <Button type="button" onClick={() => void download('insomnia')} disabled={busy !== null} className="rounded-xl">
            {busy === 'insomnia' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />}
            {t('apiTest.insomnia')}
          </Button>
        </div>
      </div>

      {busy === 'load' && <p className="text-sm text-muted-foreground">{t('apiTest.loading')}</p>}
      {error && <p className="text-sm text-amber-600 dark:text-amber-300">{error}</p>}
      {data && (
        <div className="overflow-auto rounded-xl border border-border/60">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-background/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t('apiTest.method')}</th>
                <th className="px-3 py-2">{t('apiTest.path')}</th>
                <th className="px-3 py-2">{t('apiTest.rule')}</th>
              </tr>
            </thead>
            <tbody>
              {data.endpoints.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-muted-foreground" colSpan={3}>{t('apiTest.empty')}</td>
                </tr>
              ) : data.endpoints.map((endpoint) => (
                <tr key={`${endpoint.method}:${endpoint.path}`} className="border-t border-border/60">
                  <td className="px-3 py-2 font-mono text-xs">{endpoint.method}</td>
                  <td className="px-3 py-2 font-mono text-xs">{endpoint.path}</td>
                  <td className="px-3 py-2 text-muted-foreground">{endpoint.x_business_rule ?? endpoint.summary ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
