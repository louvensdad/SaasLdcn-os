'use client';

import { useQuery } from '@tanstack/react-query';

import { Signal } from '@/components/signal';
import { Badge, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { useProject } from '@/lib/project/use-project';

export function MemoryScreen({ projectKey }: { readonly projectKey: string }) {
  const { t, locale } = useI18n();
  const project = useProject(projectKey);
  const memories = useQuery({ queryKey: ['room-memories', projectKey], queryFn: () => api.roomMemories(projectKey), retry: false });
  const insight = useQuery({ queryKey: ['evolution-insight', projectKey], queryFn: () => api.roomEvolutionInsight(projectKey), retry: false });

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.memory')}</span><span className="chip mono">{projectKey}</span></div>
          <h1 className="title">{t('memory.title')}</h1>
          <p className="lede">{t('memory.lede')}</p>
        </div>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('memory.list.title')}</h2>
          <span className="meta">{t('memory.list.meta', { count: memories.data?.length ?? 0 })}</span>
        </div>
        {memories.isPending ? <Skeleton lines={4} /> : null}
        {memories.isError ? <StateBlock kind="error" title={t('memory.list.unreadable')} /> : null}
        {memories.data && memories.data.length === 0 ? (
          <StateBlock kind="empty" title={t('memory.list.none')}>{t('memory.list.noneBody')}</StateBlock>
        ) : null}
        {memories.data && memories.data.length > 0 ? (
          <div className="list">
            {memories.data.map((memory) => (
              <div className="li" key={memory.id}>
                <Signal family="proof" label={memory.content} />
                <span className="li-title">{memory.content}</span>
                <span className="meta nowrap">{formatWhen(memory.created_at, locale)}</span>
                <span className="li-sub">
                  <span className="mono">{memory.memory_type} · {memory.status}</span>
                  {memory.origin ? ` · ${memory.origin}` : ''}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <p className="meta" style={{ marginTop: 10 }}>{t('memory.list.note')}</p>
        <Source>GET /api/project-rooms/{'{'}room_id{'}'}/memories</Source>
      </section>

      <div className="grid g-2">
        <section className="sec">
          <div className="sec-head"><h2 className="h-sec">{t('memory.insight.title')}</h2></div>
          {insight.isPending ? <Skeleton lines={3} /> : null}
          {insight.isError ? <p className="meta">{t('memory.insight.none')}</p> : null}
          {insight.data ? (
            <>
              <p className="body ink2">{insight.data.advisory_text}</p>
              <div className="chips" style={{ marginTop: 10 }}>
                <span className="chip mono">{insight.data.stack_signature}</span>
                <span className="chip mono">{t('memory.insight.sample', { count: insight.data.sample_size })}</span>
                {insight.data.certification_rate != null ? (
                  <span className="chip mono">{Math.round(insight.data.certification_rate * 100)}%</span>
                ) : null}
              </div>
              <p className="meta" style={{ marginTop: 10 }}>{t('memory.insight.note')}</p>
              <Source>GET /api/project-rooms/{'{'}room_id{'}'}/evolution-insight</Source>
            </>
          ) : null}
        </section>

        <section className="sec">
          <div className="sec-head"><h2 className="h-sec">{t('memory.docs.title')}</h2></div>
          <StateBlock kind="empty" title={t('memory.docs.none')}>{t('memory.docs.noneBody')}</StateBlock>
          {project.generatedProjectId ? <Badge value={project.generatedProjectId} family="idle" /> : null}
        </section>
      </div>
    </>
  );
}
