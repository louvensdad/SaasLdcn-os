'use client';

import { useEffect, useState } from 'react';
import { Coins, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { metaFactoryClient, type GenerationUsageSummary } from '@/lib/api/meta-factory';

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

/**
 * Compact, self-contained view of the current user's measured AI token usage
 * (GET /api/meta-factory/jobs/usage — audit B4/AI2). Real tokens accumulated per
 * generation; no fabricated $ cost. Renders nothing on error/first-load so it never
 * disrupts the host page.
 */
export function AiUsageCard({ periodDays = 30 }: { readonly periodDays?: number }) {
  const [usage, setUsage] = useState<GenerationUsageSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    metaFactoryClient
      .getUsage(periodDays)
      .then((data) => { if (active) { setUsage(data); setState('ready'); } })
      .catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [periodDays]);

  if (state === 'error') return null;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--text)]">
          <Coins className="h-4 w-4 text-[color:var(--accent)]" aria-hidden />
          Uso de IA · últimos {periodDays} dias
        </div>
        {state === 'loading' ? <Loader2 className="h-4 w-4 animate-spin text-[color:var(--muted)]" /> : null}
      </div>

      {usage ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Tokens (entrada)" value={formatTokens(usage.input_tokens)} />
            <Metric label="Tokens (saída)" value={formatTokens(usage.output_tokens)} />
            <Metric label="Total" value={formatTokens(usage.total_tokens)} />
            <Metric label="Gerações" value={String(usage.job_count)} />
          </div>
          {usage.by_model.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {usage.by_model.slice(0, 6).map((row) => (
                <Badge key={row.model ?? 'desconhecido'} tone="neutral">
                  {row.model ?? 'desconhecido'}: {formatTokens(row.input_tokens + row.output_tokens)}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[color:var(--muted)]">
              Nenhuma geração registrada neste período.
            </p>
          )}
        </>
      ) : (
        <p className="mt-4 text-sm text-[color:var(--muted)]">Carregando uso…</p>
      )}
    </Card>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white/5 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted-2)]">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-[color:var(--text)]">{value}</p>
    </div>
  );
}
