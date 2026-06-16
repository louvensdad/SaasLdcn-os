'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, GitBranch, ShieldAlert, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ComplexityRadar, OperationalRail, ReadinessRing } from '@/components/visual/engineering-surface';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/cn';
import type {
  DependencyGraphSnapshot,
  ImpactProfile,
  ReadinessProfile,
  RiskProfile,
} from '@/lib/api/types';

interface DependencyGraphPanelProps {
  readonly snapshot: DependencyGraphSnapshot | null;
  readonly impact: ImpactProfile | null;
  readonly readiness: ReadinessProfile | null;
  readonly risks: RiskProfile | null;
  readonly isLoading: boolean;
  readonly errorMessage?: string | null;
}

function compact(items: readonly string[], overflowLabel: string, limit = 3) {
  if (items.length <= limit) return items;
  return [...items.slice(0, limit), `+${items.length - limit} ${overflowLabel}`];
}

function bandTone(value?: string | null) {
  if (value === 'low') return 'success';
  if (value === 'medium') return 'accent';
  if (value === 'high') return 'warning';
  return 'danger';
}

export function DependencyGraphPanel({
  snapshot,
  impact,
  readiness,
  risks,
  isLoading,
  errorMessage,
}: DependencyGraphPanelProps) {
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    setIsOpen(Boolean(snapshot));
  }, [snapshot]);

  const graphNodes = useMemo(() => {
    const nodes = snapshot?.nodes ?? [];
    const selected = nodes.filter((node) => ['language', 'runtime', 'framework', 'architecture', 'capability', 'infrastructure'].includes(node.type));
    return selected.slice(0, 8);
  }, [snapshot?.nodes]);

  const graphEdges = useMemo(() => {
    const nodeIds = new Set(graphNodes.map((node) => node.id));
    return (snapshot?.edges ?? []).filter((edge) => nodeIds.has(edge.source_id) && nodeIds.has(edge.target_id)).slice(0, 8);
  }, [graphNodes, snapshot?.edges]);
  const mutationFeed = (snapshot?.mutations ?? []).slice(0, 3);

  if (errorMessage) {
    return (
      <Card className="relative overflow-hidden border border-white/10 bg-white/[0.04] p-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_38%)]" />
        <div className="relative space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-xl)] border border-rose-500/30 bg-rose-500/10 text-rose-200">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[color:var(--muted)]">{t('dependencyGraph.title')}</p>
              <h3 className="mt-1 text-lg font-semibold text-[color:var(--text)]">{t('dependencyGraph.unavailable')}</h3>
            </div>
          </div>
          <div className="rounded-[var(--radius-xl)] border border-rose-500/20 bg-rose-500/5 p-4 text-sm leading-6 text-rose-100">
            {errorMessage}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden border border-white/10 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent)_10%,transparent),color-mix(in_srgb,var(--surface)_90%,black_10%))] p-5 shadow-[var(--shadow-cinematic)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_14%,transparent),transparent_36%)]" />
      <div className="relative space-y-4">
        <button
          type="button"
          className="flex w-full items-start justify-between gap-4 text-left"
          onClick={() => setIsOpen((current) => !current)}
        >
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.05] text-[color:var(--text)]">
              <GitBranch className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[color:var(--muted)]">{t('dependencyGraph.title')}</p>
                <Badge className="border-white/10 text-[color:var(--muted)]">
                  {t('dependencyGraph.requiredCount', { count: snapshot?.propagation.required_node_ids.length ?? 0 })}
                </Badge>
              </div>
              <h3 className="text-xl font-semibold text-[color:var(--text)]">{t('dependencyGraph.surface')}</h3>
              <p className="max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                {t('dependencyGraph.description')}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge className="border-white/10 text-[color:var(--muted)]">{t('dependencyGraph.nodeCount', { count: snapshot?.nodes.length ?? 0 })}</Badge>
            <ChevronDown className={cn('h-4 w-4 text-[color:var(--muted)] transition-transform', isOpen ? 'rotate-180' : 'rotate-0')} />
          </div>
        </button>

        {isLoading && !snapshot ? (
          <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4 text-sm text-[color:var(--muted)]">
            {t('dependencyGraph.loading')}
          </div>
        ) : null}

        {isOpen ? (
          <div className="grid gap-4 xl:grid-cols-[1.06fr_0.94fr]">
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">{t('dependencyGraph.impact')}</p>
                  <p className="mt-2 text-2xl font-semibold text-[color:var(--text)]">{impact?.score ?? snapshot?.impact_profile.score ?? 0}</p>
                  <p className="mt-1 text-xs text-[color:var(--muted)]">{impact?.operational_burden ?? snapshot?.impact_profile.operational_burden ?? t('common.pending')}</p>
                </div>
                <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">{t('dependencyGraph.readiness')}</p>
                  <p className="mt-2 text-2xl font-semibold text-[color:var(--text)]">{readiness?.score ?? snapshot?.readiness_profile.score ?? 0}</p>
                  <p className="mt-1 text-xs text-[color:var(--muted)]">{t('dependencyGraph.productionScore', { score: readiness?.production_readiness ?? snapshot?.readiness_profile.production_readiness ?? 0 })}</p>
                </div>
                <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">{t('dependencyGraph.risk')}</p>
                  <p className="mt-2 text-2xl font-semibold text-[color:var(--text)]">{risks?.score ?? snapshot?.risk_profile.score ?? 0}</p>
                  <p className="mt-1 text-xs text-[color:var(--muted)]">{risks?.risk_level ?? snapshot?.risk_profile.risk_level ?? t('common.pending')}</p>
                </div>
                <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">{t('dependencyGraph.mutations')}</p>
                  <p className="mt-2 text-2xl font-semibold text-[color:var(--text)]">{snapshot?.mutations.length ?? 0}</p>
                  <p className="mt-1 text-xs text-[color:var(--muted)]">{t('dependencyGraph.mutationFeed')}</p>
                </div>
              </div>

              <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('dependencyGraph.nodeGraph')}</p>
                    <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">{t('dependencyGraph.nodeGraphDetail')}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="border-white/10 text-[color:var(--muted)]">{t('dependencyGraph.requiredCount', { count: snapshot?.propagation.required_node_ids.length ?? 0 })}</Badge>
                    <Badge className="border-white/10 text-[color:var(--muted)]">{t('dependencyGraph.recommendedCount', { count: snapshot?.propagation.recommended_node_ids.length ?? 0 })}</Badge>
                    <Badge className="border-white/10 text-[color:var(--muted)]">{t('dependencyGraph.warningCount', { count: snapshot?.propagation.warnings.length ?? 0 })}</Badge>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.03] p-3">
                    <svg viewBox="0 0 420 240" className="h-64 w-full">
                      <defs>
                        <linearGradient id="dependencyLine" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.85" />
                          <stop offset="100%" stopColor="var(--accent-2)" stopOpacity="0.65" />
                        </linearGradient>
                      </defs>
                      {graphEdges.map((edge, index) => {
                        const sourceIndex = Math.max(0, graphNodes.findIndex((node) => node.id === edge.source_id));
                        const targetIndex = Math.max(0, graphNodes.findIndex((node) => node.id === edge.target_id));
                        const sourceAngle = -Math.PI / 2 + (sourceIndex * Math.PI * 2) / Math.max(graphNodes.length, 1);
                        const targetAngle = -Math.PI / 2 + (targetIndex * Math.PI * 2) / Math.max(graphNodes.length, 1);
                        const sourceX = 80 + Math.cos(sourceAngle) * 66;
                        const sourceY = 110 + Math.sin(sourceAngle) * 66;
                        const targetX = 80 + Math.cos(targetAngle) * 66;
                        const targetY = 110 + Math.sin(targetAngle) * 66;
                        return (
                          <line
                            key={`${edge.id}-${index}`}
                            x1={sourceX}
                            y1={sourceY}
                            x2={targetX}
                            y2={targetY}
                            stroke="url(#dependencyLine)"
                            strokeWidth="1.6"
                            strokeDasharray={edge.type === 'requires' ? '0' : '4 3'}
                            opacity="0.9"
                          />
                        );
                      })}
                      {graphNodes.map((node, index) => {
                        const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(graphNodes.length, 1);
                        const x = 80 + Math.cos(angle) * 66;
                        const y = 110 + Math.sin(angle) * 66;
                        return (
                          <g key={node.id}>
                            <circle
                              cx={x}
                              cy={y}
                              r="18"
                              fill="rgba(255,255,255,0.07)"
                              stroke="var(--accent)"
                              strokeOpacity="0.5"
                            />
                            <circle cx={x} cy={y} r="5" fill="var(--accent-2)" />
                          </g>
                        );
                      })}
                      <circle cx="80" cy="110" r="24" fill="color-mix(in srgb, var(--accent) 20%, transparent)" stroke="var(--accent)" />
                      <text x="80" y="116" textAnchor="middle" fill="white" fontSize="11" fontWeight="700">
                        {t('dependencyGraph.graph')}
                      </text>
                    </svg>
                    <div className="flex flex-wrap gap-2">
                      {graphNodes.map((node) => (
                        <Badge key={node.id} className="border-white/10 bg-white/[0.04] text-[color:var(--text)]">
                          {node.label}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">{t('dependencyGraph.propagated')}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {compact(snapshot?.propagation.required_node_ids ?? [], t('common.more'), 3).map((item) => (
                          <Badge key={item} className="border-white/10 text-[color:var(--text)]">
                            {t('common.required')} {item}
                          </Badge>
                        ))}
                        {compact(snapshot?.propagation.recommended_node_ids ?? [], t('common.more'), 3).map((item) => (
                          <Badge key={item} className="border-white/10 bg-white/[0.04] text-[color:var(--muted)]">
                            {t('dependencyGraph.rec')} {item}
                          </Badge>
                        ))}
                        {compact(snapshot?.propagation.conflicting_node_ids ?? [], t('common.more'), 2).map((item) => (
                          <Badge key={item} className="border-white/10 text-[color:var(--warning)]">
                            {t('dependencyGraph.conflict')} {item}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">{t('dependencyGraph.mutationFeed')}</p>
                      <div className="mt-3 space-y-2">
                        {mutationFeed.map((mutation) => (
                          <div key={mutation.id} className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-[color:var(--text)]">{mutation.mutated_value}</p>
                              <Badge className="border-white/10 text-[color:var(--muted)]">{mutation.category}</Badge>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{mutation.rationale}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              <ReadinessRing
                title={t('dependencyGraph.readinessRadar')}
                value={readiness?.score ?? snapshot?.readiness_profile.score ?? 0}
                label={((readiness?.production_readiness ?? snapshot?.readiness_profile.production_readiness ?? 0) >= 70) ? t('dependencyGraph.ready') : t('dependencyGraph.needsWork')}
                caption={t('dependencyGraph.readinessDetail')}
                tone={bandTone(readiness?.warnings?.length ? 'high' : readiness?.blockers?.length ? 'high' : 'low') as 'accent' | 'accent2' | 'success' | 'warning' | 'danger' | 'muted'}
              />

              <OperationalRail
                title={t('dependencyGraph.impactSurface')}
                items={[
                  { label: t('dependencyGraph.infra'), value: impact?.infra_complexity ?? snapshot?.impact_profile.infra_complexity ?? t('common.pending') },
                  { label: t('dependencyGraph.deploy'), value: impact?.deployment_complexity ?? snapshot?.impact_profile.deployment_complexity ?? t('common.pending') },
                  { label: t('dependencyGraph.opsBurden'), value: impact?.operational_burden ?? snapshot?.impact_profile.operational_burden ?? t('common.pending') },
                  { label: t('dependencyGraph.scale'), value: impact?.scaling_complexity ?? snapshot?.impact_profile.scaling_complexity ?? t('common.pending') },
                ]}
              />

              <ComplexityRadar
                title={t('dependencyGraph.impactRadar')}
                score={impact?.score ?? snapshot?.impact_profile.score ?? 0}
                axes={[
                  { label: t('dependencyGraph.infrastructure'), value: impact?.score ?? snapshot?.impact_profile.score ?? 0 },
                  { label: t('dependencyGraph.deployment'), value: snapshot?.impact_profile.score ?? 0 },
                  { label: t('dependencyGraph.ops'), value: readiness?.score ? Math.max(10, 100 - readiness.score) : 38 },
                  { label: t('dependencyGraph.security'), value: risks?.score ? Math.max(10, 100 - risks.score) : 36 },
                ]}
              />

              <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[color:var(--accent)]" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('dependencyGraph.riskSurface')}</p>
                </div>
                <div className="mt-3 space-y-2">
                  {(risks?.issues ?? snapshot?.risk_profile.issues ?? []).slice(0, 3).map((issue) => (
                    <div key={issue.id} className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[color:var(--text)]">{issue.title}</p>
                        <Badge className="border-white/10 text-[color:var(--muted)]">{issue.severity}</Badge>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{issue.summary}</p>
                    </div>
                  ))}
                  {!((risks?.issues ?? snapshot?.risk_profile.issues ?? []).length) ? (
                    <p className="text-sm text-[color:var(--muted)]">{t('dependencyGraph.noCriticalRisks')}</p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
