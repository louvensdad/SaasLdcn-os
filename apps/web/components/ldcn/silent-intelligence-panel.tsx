'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleAlert, ExternalLink, Info, ShieldAlert } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiRequest } from '@/lib/api/client';
import { apiEndpoints } from '@/lib/api/endpoints';
import type { PresenceDecision, PresenceDecisionResponse, PresenceSeverity } from '@contracts/system-presence.contract';

const severityTone: Record<PresenceSeverity, 'neutral' | 'success' | 'warning' | 'danger'> = { INFO: 'neutral', SUCCESS: 'success', WARNING: 'warning', ERROR: 'danger', CRITICAL: 'danger' };
const severityIcon: Record<PresenceSeverity, typeof Info> = { INFO: Info, SUCCESS: CheckCircle2, WARNING: AlertTriangle, ERROR: CircleAlert, CRITICAL: ShieldAlert };

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function SilentIntelligencePanel({ workspaceId, projectId }: { readonly workspaceId?: string; readonly projectId?: string }) {
  const [severity, setSeverity] = useState('');
  const params = useMemo(() => { const query = new URLSearchParams(); if (workspaceId) query.set('workspace_id', workspaceId); if (projectId) query.set('project_id', projectId); if (severity) query.set('severity', severity); query.set('limit', '8'); return query; }, [workspaceId, projectId, severity]);
  const query = useQuery<PresenceDecisionResponse>({ queryKey: ['presence-decisions', workspaceId ?? 'current', projectId ?? 'all', severity], queryFn: () => apiRequest<PresenceDecisionResponse>(`${apiEndpoints.systemPresenceDecisions}?${params.toString()}`), staleTime: 10_000, refetchInterval: 15_000, retry: 1, placeholderData: (previous) => previous });
  const items = query.data?.items ?? [];
  const stale = query.isError || (query.dataUpdatedAt > 0 && Date.now() - query.dataUpdatedAt > 45_000);

  return (
    <Card surface="secondary" className="overflow-hidden p-5" data-testid="silent-intelligence-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--border)] pb-4">
        <div>
          <p className="ds-label text-[color:var(--accent)]">Presença operacional</p>
          <h2 className="mt-1 text-lg font-semibold text-[color:var(--text)]">Decisões e evidências</h2>
          <p className="mt-1 ds-caption">Somente sinais persistidos pelos engines e auditorias do sistema.</p>
        </div>
        <label className="ds-caption flex items-center gap-2">Severidade<select aria-label="Filtrar por severidade" value={severity} onChange={(event) => setSeverity(event.target.value)} className="rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface-3)] px-2 py-1 text-xs text-[color:var(--text)]"><option value="">Todas</option><option value="CRITICAL">Crítica</option><option value="ERROR">Erro</option><option value="WARNING">Aviso</option><option value="SUCCESS">Sucesso</option><option value="INFO">Info</option></select></label>
      </div>
      {stale ? <p className="mt-3 rounded-[var(--radius-sm)] border border-[color:var(--warning)]/30 px-3 py-2 text-xs text-[color:var(--warning)]" role="status">Última evidência válida mantida; atualização indisponível.</p> : null}
      <div className="mt-4 space-y-2">
        {query.isPending ? <p className="ds-caption">Lendo evidências…</p> : query.isError && items.length === 0 ? <p className="ds-caption">Presença indisponível.</p> : items.length === 0 ? <p className="ds-caption">Nenhuma decisão registrada.</p> : items.map((item) => <DecisionRow key={item.id} item={item} />)}
      </div>
    </Card>
  );
}

function DecisionRow({ item }: { readonly item: PresenceDecision }) {
  const Icon = severityIcon[item.severity] ?? Info;
  return <div className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-3"><span className="mt-0.5 shrink-0" style={{ color: item.severity === 'CRITICAL' || item.severity === 'ERROR' ? 'var(--danger)' : item.severity === 'WARNING' ? 'var(--warning)' : 'var(--accent)' }}><Icon className="h-4 w-4" aria-hidden /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold capitalize text-[color:var(--text)]">{item.title}</p><Badge tone={severityTone[item.severity]}>{item.severity}</Badge><span className="ds-metadata">{item.category}</span></div><p className="mt-1 ds-caption">{item.summary ?? 'Evidência registrada sem resumo adicional.'}</p><p className="mt-1 ds-metadata">{item.source} · {timeLabel(item.occurredAt)} · {item.correlationId}</p></div>{item.evidenceRef ? <a href={item.evidenceRef} aria-label={`Abrir evidência de ${item.title}`} className="shrink-0 text-[color:var(--accent)] focus-ring"><ExternalLink className="h-4 w-4" aria-hidden /></a> : null}</div>;
}