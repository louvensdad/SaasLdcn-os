'use client';

import { useEffect } from 'react';
import { ArrowRight, Boxes, Braces, Cloud, Database, Globe2, Server, Workflow } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Disclosure } from '@/components/ui/disclosure';
import { SectionHeader } from '@/components/shell/section-header';
import { TopologyGraph } from '@/components/three/topology-graph';
import { OperationalRail } from '@/components/visual/engineering-surface';
import { useLocale } from '@/hooks/use-locale';
import { useLDCNStore } from '@/stores/use-ldcn-store';

const graphNodes = [
  { id: 'frontend', icon: Globe2, tone: 'accent' },
  { id: 'api', icon: Braces, tone: 'accent2' },
  { id: 'backend', icon: Server, tone: 'success' },
  { id: 'database', icon: Database, tone: 'warning' },
  { id: 'queues', icon: Workflow, tone: 'accent' },
  { id: 'integrations', icon: Cloud, tone: 'accent2' },
] as const;

const connections = [
  ['frontend', 'api'],
  ['api', 'backend'],
  ['backend', 'database'],
  ['backend', 'queues'],
  ['queues', 'integrations'],
] as const;

export default function ArchitecturePage() {
  const { locale, t } = useLocale();
  const setPresenceState = useLDCNStore((state) => state.setPresenceState);
  const setContext = useLDCNStore((state) => state.setContext);

  useEffect(() => {
    setPresenceState('observing');
    setContext({
      route: '/architecture',
      page_title: t('architecture.title'),
      current_phase: t('architecture.phase'),
      pipeline: {
        route: '/architecture',
        phase: t('architecture.phase'),
        status: 'ready',
        readiness_label: t('architecture.ready'),
        detail: t('architecture.description'),
      },
      status: 'observing',
      summary: t('architecture.description'),
      suggestions: [],
    });
  }, [locale, setContext, setPresenceState]);

  return (
    <div className="space-y-8">
      <SectionHeader title={t('architecture.title')} description={t('architecture.description')} />

      <Card className="relative overflow-hidden p-5 md:p-7" data-testid="engineering-architecture-graph">
        <div className="ambient-grid pointer-events-none absolute inset-0 opacity-25" />
        <div className="relative space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="type-label text-[color:var(--muted)]">{t('architecture.graph.eyebrow')}</p>
              <h2 className="mt-2 text-2xl font-semibold text-[color:var(--text)]">{t('architecture.graph.title')}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">{t('architecture.graph.description')}</p>
            </div>
            <Badge>{t('architecture.graph.compatible')}</Badge>
          </div>

          <TopologyGraph
            className="h-[clamp(20rem,42vh,30rem)] overflow-hidden rounded-[var(--radius-xl)] border border-white/10 bg-black/20"
            nodes={graphNodes.map(({ id }) => ({ id, label: t(`architecture.node.${id}`) }))}
            edges={connections.map(([from, to]) => ({ from, to }))}
            fallback={
              <div className="grid gap-3 lg:grid-cols-6">
                {graphNodes.map(({ id, icon: Icon }, index) => (
                  <div key={id} className="relative">
                    <div className="h-full rounded-[var(--radius-xl)] border border-white/10 bg-black/20 p-4 shadow-[var(--shadow-soft)]">
                      <div className="flex items-center justify-between gap-3">
                        <Icon className="h-5 w-5 text-[color:var(--accent)]" aria-hidden />
                        <span className="h-2 w-2 rounded-full bg-[color:var(--success)] shadow-[0_0_14px_var(--glow)]" />
                      </div>
                      <p className="mt-5 text-sm font-semibold text-[color:var(--text)]">{t(`architecture.node.${id}`)}</p>
                      <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">{t(`architecture.node.${id}.detail`)}</p>
                    </div>
                    {index < graphNodes.length - 1 ? (
                      <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 text-[color:var(--accent)] lg:block" aria-hidden />
                    ) : null}
                  </div>
                ))}
              </div>
            }
          />

          <div className="flex flex-wrap gap-2">
            {connections.map(([from, to]) => <Badge key={`${from}-${to}`}>{t(`architecture.node.${from}`)} → {t(`architecture.node.${to}`)}</Badge>)}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <OperationalRail
          title={t('architecture.layers.title')}
          items={[
            { label: t('architecture.layers.contracts'), value: 'packages/contracts', detail: t('architecture.layers.contracts.detail'), tone: 'accent' },
            { label: t('architecture.layers.modules'), value: 'apps/api + apps/web', detail: t('architecture.layers.modules.detail'), tone: 'success' },
            { label: t('architecture.layers.integrations'), value: 'GitHub + GitLab', detail: t('architecture.layers.integrations.detail'), tone: 'accent2' },
            { label: t('architecture.layers.governance'), value: 'Gatekeeper', detail: t('architecture.layers.governance.detail'), tone: 'warning' },
          ]}
        />
        <Card className="space-y-5 p-5">
          <Boxes className="h-6 w-6 text-[color:var(--accent)]" aria-hidden />
          <div>
            <p className="type-label text-[color:var(--muted)]">{t('architecture.summary.eyebrow')}</p>
            <h3 className="mt-2 text-xl font-semibold text-[color:var(--text)]">{t('architecture.summary.title')}</h3>
            <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{t('architecture.summary.description')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {graphNodes.map(({ id }) => <Badge key={id}>{t(`architecture.node.${id}`)}</Badge>)}
          </div>
        </Card>
      </div>

      <Disclosure title={t('architecture.advanced.title')} description={t('architecture.advanced.description')}>
        <div className="grid gap-4 md:grid-cols-3">
          {['runtime', 'engines', 'registries'].map((item) => (
            <Card key={item} className="space-y-3 p-5">
              <p className="type-card text-[color:var(--text)]">{t(`architecture.advanced.${item}`)}</p>
              <p className="type-caption text-[color:var(--muted)]">{t(`architecture.advanced.${item}.detail`)}</p>
              <Badge>{t('architecture.ready')}</Badge>
            </Card>
          ))}
        </div>
      </Disclosure>
    </div>
  );
}
