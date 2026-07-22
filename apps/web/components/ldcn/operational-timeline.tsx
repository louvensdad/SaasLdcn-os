'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/hooks/use-locale';
import { apiRequest } from '@/lib/api/client';
import { apiEndpoints } from '@/lib/api/endpoints';
import type { PresenceDecisionResponse } from '@contracts/system-presence.contract';

type Translator = (key: string, values?: Record<string, string | number>) => string;

function tone(severity: string): 'success' | 'danger' | 'warning' | 'neutral' { return severity === 'SUCCESS' ? 'success' : severity === 'ERROR' || severity === 'CRITICAL' ? 'danger' : severity === 'WARNING' ? 'warning' : 'neutral'; }
function dateLabel(locale: string, value: string): string { return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }

const SEVERITY_LABEL_KEY: Record<string, string> = {
  CRITICAL: 'ldcn.operationalTimeline.severity.critical',
  ERROR: 'ldcn.operationalTimeline.severity.error',
  WARNING: 'ldcn.operationalTimeline.severity.warning',
  SUCCESS: 'ldcn.operationalTimeline.severity.success',
};

function severityLabel(t: Translator, severity: string) {
  const key = SEVERITY_LABEL_KEY[severity];
  return key ? t(key) : severity;
}

export function OperationalTimeline({ limit = 8, workspaceId, projectId }: { readonly limit?: number; readonly workspaceId?: string; readonly projectId?: string }) {
  const { t, locale } = useLocale();
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');
  const params = useMemo(() => { const query = new URLSearchParams({ limit: String(limit) }); if (workspaceId) query.set('workspace_id', workspaceId); if (projectId) query.set('project_id', projectId); if (category) query.set('category', category); if (severity) query.set('severity', severity); return query; }, [limit, workspaceId, projectId, category, severity]);
  const query = useQuery<PresenceDecisionResponse>({ queryKey: ['operational-timeline', limit, workspaceId ?? 'current', projectId ?? 'all', category, severity], queryFn: () => apiRequest<PresenceDecisionResponse>(`${apiEndpoints.systemPresenceDecisions}?${params.toString()}`), staleTime: 10_000, refetchInterval: 15_000, retry: 1, placeholderData: (previous) => previous });
  const stale = query.isError || (query.dataUpdatedAt > 0 && Date.now() - query.dataUpdatedAt > 45_000);
  const items = query.data?.items ?? [];

  return <Card surface="secondary" className="p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="ds-label text-[color:var(--accent)]">{t('ldcn.operationalTimeline.title')}</p><p className="mt-1 ds-caption">{t('ldcn.operationalTimeline.description')}</p></div><div className="flex gap-2"><select aria-label={t('ldcn.operationalTimeline.categoryAria')} value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface-3)] px-2 py-1 text-xs"><option value="">{t('ldcn.operationalTimeline.categoriesLabel')}</option><option value="BUILD">{t('ldcn.operationalTimeline.category.build')}</option><option value="SECURITY">{t('ldcn.operationalTimeline.category.security')}</option><option value="SANDBOX">{t('ldcn.operationalTimeline.category.sandbox')}</option><option value="RUNTIME">{t('ldcn.operationalTimeline.category.runtime')}</option></select><select aria-label={t('ldcn.operationalTimeline.severityAria')} value={severity} onChange={(event) => setSeverity(event.target.value)} className="rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface-3)] px-2 py-1 text-xs"><option value="">{t('ldcn.operationalTimeline.severityLabel')}</option><option value="CRITICAL">{t('ldcn.operationalTimeline.severity.critical')}</option><option value="ERROR">{t('ldcn.operationalTimeline.severity.error')}</option><option value="WARNING">{t('ldcn.operationalTimeline.severity.warning')}</option><option value="SUCCESS">{t('ldcn.operationalTimeline.severity.success')}</option></select></div></div>{stale ? <p className="mt-3 text-xs text-[color:var(--warning)]" role="status">{t('ldcn.operationalTimeline.stale')}</p> : null}<div className="mt-4">{query.isPending ? <p className="ds-caption">{t('ldcn.operationalTimeline.loading')}</p> : query.isError && items.length === 0 ? <p className="ds-caption">{t('ldcn.operationalTimeline.error')}</p> : items.length === 0 ? <p className="ds-caption">{t('ldcn.operationalTimeline.empty')}</p> : <ol className="space-y-3">{items.map((item) => <li key={item.id} className="flex items-start gap-3 border-b border-[color:var(--border)] pb-3 last:border-0"><span className="ds-metadata w-28 shrink-0 pt-0.5 text-[color:var(--muted)]">{dateLabel(locale, item.occurredAt)}</span><div className="min-w-0 flex-1"><p className="ds-body-sm font-semibold capitalize text-[color:var(--text)]">{item.title}</p><p className="ds-metadata">{item.category} · {item.source} · {item.correlationId}</p>{item.evidenceRef ? <p className="ds-metadata">{t('architectureReview.model.evidenceLabel')} {item.evidenceRef}</p> : null}</div><Badge tone={tone(item.severity)}>{severityLabel(t, item.severity)}</Badge></li>)}</ol>}</div></Card>;
}
