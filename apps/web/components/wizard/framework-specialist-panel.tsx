'use client';

import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  Workflow,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/cn';
import type {
  FrameworkArchitectureGuidance,
  FrameworkCapabilityGuidance,
  FrameworkEndpointGuidance,
  FrameworkReadinessProfile,
  FrameworkSpecialistProfile,
} from '@/lib/api/types';

interface FrameworkSpecialistPanelProps {
  readonly frameworkId: string | null;
  readonly frameworkName?: string | null;
  readonly profile: FrameworkSpecialistProfile | null;
  readonly architectures: readonly FrameworkArchitectureGuidance[];
  readonly capabilities: readonly FrameworkCapabilityGuidance[];
  readonly endpointGroups: readonly FrameworkEndpointGuidance[];
  readonly readiness: FrameworkReadinessProfile | null;
  readonly isLoading: boolean;
  readonly errorMessage?: string | null;
}

function compactList(items: readonly string[], moreLabel: (count: number) => string, limit = 3) {
  if (items.length <= limit) {
    return items;
  }

  return [...items.slice(0, limit), moreLabel(items.length - limit)];
}

export function FrameworkSpecialistPanel({
  frameworkId,
  frameworkName,
  profile,
  architectures,
  capabilities,
  endpointGroups,
  readiness,
  isLoading,
  errorMessage,
}: FrameworkSpecialistPanelProps) {
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    setIsOpen(Boolean(profile));
  }, [frameworkId, profile]);

  const resolvedFrameworkName = frameworkName ?? profile?.framework_name ?? t('wizard.framework');
  const readinessLabel = readiness?.label ?? profile?.readiness_profile.label ?? t('wizard.readinessPending');
  const readinessScore = readiness?.score ?? profile?.readiness_profile.score ?? 0;
  const moreLabel = (count: number) => t('wizard.moreItems', { count });

  if (!frameworkId) {
    return (
      <Card className="relative overflow-hidden border border-dashed border-white/10 bg-white/[0.03] p-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_40%)]" />
        <div className="relative space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[color:var(--muted)]">{t('wizard.frameworkSpecialist')}</p>
          <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.selectFrameworkGuidance')}</p>
          <p className="text-sm leading-6 text-[color:var(--muted)]">
            {t('wizard.frameworkPanelDescription')}
          </p>
        </div>
      </Card>
    );
  }

  if (errorMessage) {
    return (
      <Card className="relative overflow-hidden border border-white/10 bg-white/[0.03] p-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_12%,transparent),transparent_36%)]" />
        <div className="relative space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-xl)] border border-rose-500/30 bg-rose-500/10 text-rose-200">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[color:var(--muted)]">{t('wizard.frameworkSpecialist')}</p>
              <h3 className="mt-1 text-lg font-semibold text-[color:var(--text)]">{resolvedFrameworkName}</h3>
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
    <Card className="relative min-w-0 border border-white/10 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent)_9%,transparent),color-mix(in_srgb,var(--surface)_92%,black_8%))] p-5 shadow-[var(--shadow-cinematic)]" data-visibility-audit="framework-specialist-panel">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_15%,transparent),transparent_35%)]" />
      <div className="relative space-y-4">
        <button
          type="button"
          className="flex w-full items-start justify-between gap-4 text-left"
          onClick={() => setIsOpen((current) => !current)}
        >
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.05] text-[color:var(--text)]">
              <Workflow className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[color:var(--muted)]">{t('wizard.frameworkSpecialist')}</p>
                <Badge className="border-white/10 text-[color:var(--muted)]">{readinessLabel}</Badge>
              </div>
              <h3 className="text-xl font-semibold text-[color:var(--text)]">{resolvedFrameworkName}</h3>
              <p className="max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                {profile?.summary ?? t('wizard.specialistGuidancePending')}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge className="border-white/10 text-[color:var(--muted)]">{t('wizard.percentReady', { score: readinessScore })}</Badge>
            <ChevronDown className={cn('h-4 w-4 text-[color:var(--muted)] transition-transform', isOpen ? 'rotate-180' : 'rotate-0')} />
          </div>
        </button>

        <div className="flex flex-wrap gap-2">
          <Badge className="border-white/10 text-[color:var(--muted)]">{profile?.specialist_label ?? t('wizard.specialistGuidance')}</Badge>
          {compactList(profile?.best_for ?? [], moreLabel).map((item) => (
            <Badge key={item} className="border-white/10 bg-white/[0.04] text-[color:var(--text)]">
              {item}
            </Badge>
          ))}
        </div>

        {isLoading && !profile ? (
          <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4 text-sm text-[color:var(--muted)]">
            {t('wizard.loadingFrameworkProfile')}
          </div>
        ) : null}

        {isOpen ? (
          <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="grid gap-4">
              <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('wizard.architectureGuidance')}</p>
                    <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">{t('wizard.recommendedFrameworkShapes')}</p>
                  </div>
                  <Badge className="border-white/10 text-[color:var(--muted)]">{architectures.length}</Badge>
                </div>
                <div className="mt-3 grid gap-2">
                  {architectures.map((item) => (
                    <div key={item.architecture_id} className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[color:var(--text)]">{item.architecture_name}</p>
                        <Badge className="border-white/10 text-[color:var(--muted)]">{item.architecture_id}</Badge>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">{item.summary}</p>
                      <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">
                        <span className="font-semibold text-[color:var(--text)]">{t('wizard.tradeoff')}:</span> {item.tradeoff}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('wizard.recommendedCapabilities')}</p>
                  <div className="mt-3 grid gap-2">
                    {capabilities.map((item) => (
                      <div key={item.capability_id} className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-[color:var(--text)]">{item.capability_name}</p>
                          <Badge className="border-white/10 text-[color:var(--muted)]">{item.priority}</Badge>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{item.summary}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('wizard.readiness')}</p>
                  <div className="mt-3 space-y-3">
                    <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-3">
                      <p className="text-sm font-semibold text-[color:var(--text)]">{readiness?.label ?? profile?.readiness_profile.label}</p>
                      <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{readiness?.summary ?? profile?.readiness_profile.summary}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {compactList(readiness?.signals ?? profile?.readiness_profile.signals ?? [], moreLabel, 2).map((item) => (
                        <Badge key={item} className="border-white/10 bg-white/[0.04] text-[color:var(--text)]">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[color:var(--accent)]" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('wizard.pitfallsTradeoffs')}</p>
                </div>
                <div className="mt-3 space-y-2">
                  {compactList(profile?.common_pitfalls ?? [], moreLabel, 3).map((item) => (
                    <div key={item} className="rounded-[var(--radius-xl)] border border-amber-500/15 bg-amber-500/5 p-3 text-sm leading-6 text-[color:var(--muted)]">
                      <div className="flex items-start gap-2">
                        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                        <span>{item}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('wizard.endpointGuidance')}</p>
                <div className="mt-3 space-y-2">
                  {endpointGroups.map((group) => (
                    <div key={group.endpoint_group} className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[color:var(--text)]">{group.title}</p>
                        <Badge className="border-white/10 text-[color:var(--muted)]">{group.endpoint_group}</Badge>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{group.summary}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('wizard.testingBaseline')}</p>
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">{t('wizard.testing')}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {compactList(profile?.testing_strategy ?? [], moreLabel, 2).map((item) => (
                        <Badge key={item} className="border-white/10 bg-white/[0.04] text-[color:var(--text)]">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">{t('wizard.security')}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {compactList(profile?.security_baseline ?? [], moreLabel, 2).map((item) => (
                        <Badge key={item} className="border-white/10 bg-white/[0.04] text-[color:var(--text)]">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">{t('wizard.infrastructure')}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {compactList(profile?.infrastructure_baseline ?? [], moreLabel, 3).map((item) => (
                        <Badge key={item} className="border-white/10 bg-white/[0.04] text-[color:var(--text)]">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('wizard.supportedArchetypes')}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {compactList(profile?.supported_archetypes ?? [], moreLabel, 4).map((item) => (
                    <Badge key={item} className="border-white/10 bg-white/[0.04] text-[color:var(--text)]">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
