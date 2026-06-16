'use client';
import { Activity } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { SystemDesignVisualizationPayload } from '@/lib/api/types';
import { useArchitectureTopology } from '@/hooks/use-architecture-topology';
import { useDependencyVisualization } from '@/hooks/use-dependency-visualization';
import { useDeploymentTopology } from '@/hooks/use-deployment-topology';
import { useInfrastructureTopology } from '@/hooks/use-infrastructure-topology';
import { useReadinessZones } from '@/hooks/use-readiness-zones';
import { useRiskZones } from '@/hooks/use-risk-zones';
import { useRuntimeFlow } from '@/hooks/use-runtime-flow';
import { useTeamTopology } from '@/hooks/use-team-topology';
import { useLocale } from '@/hooks/use-locale';
import { ArchitectureTopologySurface } from './architecture-topology-surface';
import { DependencyGraphSurface } from './dependency-graph-surface';
import { DeploymentTopologySurface } from './deployment-topology-surface';
import { InfrastructureTopologySurface } from './infrastructure-topology-surface';
import { ReadinessZonesSurface } from './readiness-zones-surface';
import { RiskZonesSurface } from './risk-zones-surface';
import { RuntimeFlowSurface } from './runtime-flow-surface';
import { TeamTopologySurface } from './team-topology-surface';

export function VisualizationCockpit({ payload, offlineMessage }: { readonly payload: SystemDesignVisualizationPayload | null; readonly offlineMessage: string }) {
  const { t } = useLocale();
  const architecture = useArchitectureTopology(payload);
  const infrastructure = useInfrastructureTopology(payload);
  const runtime = useRuntimeFlow(payload);
  const dependency = useDependencyVisualization(payload);
  const risks = useRiskZones(payload);
  const readiness = useReadinessZones(payload);
  const team = useTeamTopology(payload);
  const deployment = useDeploymentTopology(payload);
  const queries = [architecture, infrastructure, runtime, dependency, risks, readiness, team, deployment];
  const error = queries.some((query) => query.isError);
  const loading = queries.some((query) => query.isLoading);

  if (!payload || loading) return <Card className="grid gap-3 p-5" data-testid="visualization-cockpit"><p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('systemDesign.cockpit')}</p><p className="text-sm text-[color:var(--muted)]">{payload ? t('systemDesign.synchronizing') : t('systemDesign.selectArchitecture')}</p></Card>;
  if (error || !architecture.data || !infrastructure.data || !runtime.data || !dependency.data || !risks.data || !readiness.data || !team.data || !deployment.data) return <Card className="grid gap-3 p-5" data-testid="visualization-cockpit"><div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--text)]"><Activity className="h-4 w-4 text-[color:var(--warning)]" />{t('systemDesign.offline')}</div><p className="text-sm text-[color:var(--muted)]">{offlineMessage}</p></Card>;

  return (
    <section className="grid gap-4" data-testid="visualization-cockpit">
      <ArchitectureTopologySurface topology={architecture.data} />
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]"><RuntimeFlowSurface flow={runtime.data} /><InfrastructureTopologySurface topology={infrastructure.data} /></div>
      <ReadinessZonesSurface zones={readiness.data} />
      <div className="grid gap-4 xl:grid-cols-2"><DependencyGraphSurface visualization={dependency.data} /><RiskZonesSurface zones={risks.data} /></div>
      <div className="grid gap-4 xl:grid-cols-2"><TeamTopologySurface topology={team.data} /><DeploymentTopologySurface topology={deployment.data} /></div>
    </section>
  );
}
