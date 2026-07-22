'use client';

import { ArrowRight, Boxes, Database, GitBranch, Server, ShieldCheck, Workflow, type LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useLocale } from '@/hooks/use-locale';
import type {
  ArchitectureModel,
  DisasterRecovery,
  FlowStep,
  ModuleDependency,
  Strategy,
} from '@contracts/architecture-model.contract';

const NODE_ICON: Record<string, LucideIcon> = {
  actor: ShieldCheck, layer: Server, store: Database, external: GitBranch, node: Boxes,
};

function Empty({ children }: { readonly children: React.ReactNode }) {
  return <p className="ds-caption text-[color:var(--muted-2)]">{children}</p>;
}

/** Context diagram: actors → layers → stores, as a connected flow of chips. */
export function ContextDiagramView({ model }: { readonly model: ArchitectureModel }) {
  const { t } = useLocale();
  const nodes = model.context_diagram.nodes;
  if (!nodes.length) return <Empty>{t('architectureReview.model.contextEmpty')}</Empty>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {nodes.map((node, index) => {
        const Icon = NODE_ICON[node.kind] ?? Boxes;
        return (
          <span key={node.id} className="flex items-center gap-2">
            <span className="glass flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2">
              <Icon className="h-4 w-4 text-[color:var(--accent)]" aria-hidden />
              <span className="text-xs font-semibold text-[color:var(--text)]">{node.label}</span>
            </span>
            {index < nodes.length - 1 ? <ArrowRight className="h-4 w-4 text-[color:var(--muted-2)]" aria-hidden /> : null}
          </span>
        );
      })}
    </div>
  );
}

export function BoundedContextsView({ model }: { readonly model: ArchitectureModel }) {
  const { t } = useLocale();
  if (!model.bounded_contexts.length) return <Empty>{t('architectureReview.model.boundedContextsEmpty')}</Empty>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {model.bounded_contexts.map((ctx) => (
        <Card key={ctx.name} className="glass space-y-2 p-4">
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-[color:var(--accent)]" aria-hidden />
            <h4 className="text-sm font-semibold text-[color:var(--text)]">{ctx.name}</h4>
          </div>
          <p className="ds-caption text-[color:var(--muted)]">{ctx.responsibility}</p>
          {ctx.entities.length ? (
            <div className="flex flex-wrap gap-1">{ctx.entities.map((e) => <Badge key={e} tone="neutral">{e}</Badge>)}</div>
          ) : null}
          {ctx.relationships.length ? (
            <p className="ds-caption"><span className="font-semibold text-[color:var(--text)]">{t('architectureReview.model.relationsLabel')}</span> {ctx.relationships.join(', ')}</p>
          ) : null}
          {ctx.evidence ? <p className="ds-caption text-[color:var(--muted-2)]">{t('architectureReview.model.evidenceLabel')} {ctx.evidence}</p> : null}
        </Card>
      ))}
    </div>
  );
}

export function FlowView({ steps, title, icon: Icon }: { readonly steps: FlowStep[]; readonly title: string; readonly icon: LucideIcon }) {
  const { t } = useLocale();
  if (!steps.length) return <Empty>{t('architectureReview.model.flowEmpty', { title })}</Empty>;
  return (
    <div className="space-y-2">
      <p className="t-overline flex items-center gap-2"><Icon className="h-3.5 w-3.5" aria-hidden /> {title}</p>
      <ol className="flex flex-wrap items-stretch gap-2">
        {steps.map((s, index) => (
          <li key={s.step} className="flex items-center gap-2">
            <span className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_45%,transparent)] px-3 py-2">
              <span className="block text-xs font-semibold text-[color:var(--text)]">{s.step}</span>
              {s.detail ? <span className="block ds-caption text-[color:var(--muted-2)]">{s.detail}</span> : null}
            </span>
            {index < steps.length - 1 ? <ArrowRight className="h-4 w-4 text-[color:var(--muted-2)]" aria-hidden /> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function DependenciesView({ deps }: { readonly deps: ModuleDependency[] }) {
  const { t } = useLocale();
  if (!deps.length) return <Empty>{t('architectureReview.model.dependenciesEmpty')}</Empty>;
  return (
    <div className="space-y-2">
      {deps.map((d) => (
        <div key={d.module} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
          <Badge tone="accent">{d.module}</Badge>
          <ArrowRight className="h-4 w-4 text-[color:var(--muted-2)]" aria-hidden />
          {d.depends_on.map((dep) => <Badge key={dep} tone="neutral">{dep}</Badge>)}
        </div>
      ))}
    </div>
  );
}

export function StrategyView({ strategy, title }: { readonly strategy: Strategy; readonly title: string }) {
  const { t } = useLocale();
  return (
    <Card className="glass space-y-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-[color:var(--text)]">{title}</h4>
        <Badge tone={strategy.available ? 'success' : 'neutral'}>{strategy.available ? t('architectureReview.model.strategyDefined') : t('architectureReview.model.strategyUnavailable')}</Badge>
      </div>
      <p className="ds-caption text-[color:var(--muted)]">{strategy.summary}</p>
      {strategy.items.length ? (
        <ul className="ml-4 list-disc space-y-0.5 ds-caption text-[color:var(--muted)]">
          {strategy.items.map((item, index) => <li key={index}>{item}</li>)}
        </ul>
      ) : null}
    </Card>
  );
}

export function DisasterRecoveryView({ dr }: { readonly dr: DisasterRecovery }) {
  const { t } = useLocale();
  if (!dr.available) {
    return (
      <Card className="glass space-y-1 p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-[color:var(--text)]">{t('architectureReview.model.disasterRecovery.title')}</h4>
          <Badge tone="neutral">{t('architectureReview.model.strategyUnavailable')}</Badge>
        </div>
        <Empty>{t('architectureReview.model.disasterRecovery.noDbEmpty')}</Empty>
      </Card>
    );
  }
  const rows: [string, string][] = [
    [t('architectureReview.model.dr.backup'), dr.backup], [t('architectureReview.model.dr.restore'), dr.restore], [t('architectureReview.model.dr.rto'), dr.rto], [t('architectureReview.model.dr.rpo'), dr.rpo], [t('architectureReview.model.dr.replication'), dr.replication],
  ];
  return (
    <Card className="glass space-y-2 p-4">
      <h4 className="text-sm font-semibold text-[color:var(--text)]">{t('architectureReview.model.disasterRecovery.title')}</h4>
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
            <p className="t-overline">{label}</p>
            <p className="mt-1 ds-caption text-[color:var(--muted)]">{value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Convenience wrapper: the two model tabs (Modelo + Estratégias). */
export function ArchitectureModelTab({ model }: { readonly model: ArchitectureModel }) {
  const { t } = useLocale();
  return (
    <div className="space-y-6">
      <Card className="glass noise space-y-3 p-6">
        <h3 className="ds-subsection text-[color:var(--text)]">{t('architectureReview.model.contextDiagramTitle')}</h3>
        <ContextDiagramView model={model} />
      </Card>
      <Card className="glass noise space-y-4 p-6">
        <h3 className="ds-subsection text-[color:var(--text)]">{t('architectureReview.model.boundedContextsTitle')}</h3>
        <BoundedContextsView model={model} />
      </Card>
      <Card className="glass noise space-y-4 p-6">
        <h3 className="ds-subsection text-[color:var(--text)]">{t('architectureReview.model.flowsTitle')}</h3>
        <FlowView steps={model.data_flow} title={t('architectureReview.model.dataFlowTitle')} icon={Workflow} />
        <FlowView steps={model.auth_flow} title={t('architectureReview.model.authFlowTitle')} icon={ShieldCheck} />
      </Card>
      <Card className="glass noise space-y-4 p-6">
        <h3 className="ds-subsection text-[color:var(--text)]">{t('architectureReview.model.dependenciesTitle')}</h3>
        <DependenciesView deps={model.dependencies} />
      </Card>
    </div>
  );
}

export function ArchitectureStrategiesTab({ model }: { readonly model: ArchitectureModel }) {
  const { t } = useLocale();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <StrategyView strategy={model.deploy_strategy} title={t('architectureReview.model.deployStrategyTitle')} />
      <StrategyView strategy={model.cache_strategy} title={t('architectureReview.model.cacheStrategyTitle')} />
      <StrategyView strategy={model.events} title={t('architectureReview.model.eventsTitle')} />
      <DisasterRecoveryView dr={model.disaster_recovery} />
    </div>
  );
}
