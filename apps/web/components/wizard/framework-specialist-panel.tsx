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

function compactList(items: readonly string[], limit = 3) {
  if (items.length <= limit) {
    return items;
  }

  return [...items.slice(0, limit), `+${items.length - limit} more`];
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
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    setIsOpen(Boolean(profile));
  }, [frameworkId, profile]);

  const resolvedFrameworkName = frameworkName ?? profile?.framework_name ?? 'Framework';
  const readinessLabel = readiness?.label ?? profile?.readiness_profile.label ?? 'Readiness pending';
  const readinessScore = readiness?.score ?? profile?.readiness_profile.score ?? 0;

  if (!frameworkId) {
    return (
      <Card className="relative overflow-hidden border border-dashed border-white/10 bg-white/[0.03] p-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_40%)]" />
        <div className="relative space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[color:var(--muted)]">Framework specialist</p>
          <p className="text-sm font-semibold text-[color:var(--text)]">Select a framework to load specialist guidance.</p>
          <p className="text-sm leading-6 text-[color:var(--muted)]">
            The panel will show architectures, capabilities, endpoint guidance, pitfalls and readiness once a framework is chosen.
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
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[color:var(--muted)]">Framework specialist</p>
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
    <Card className="relative overflow-hidden border border-white/10 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent)_9%,transparent),color-mix(in_srgb,var(--surface)_92%,black_8%))] p-5 shadow-[var(--shadow-cinematic)]">
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
                <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[color:var(--muted)]">Framework specialist</p>
                <Badge className="border-white/10 text-[color:var(--muted)]">{readinessLabel}</Badge>
              </div>
              <h3 className="text-xl font-semibold text-[color:var(--text)]">{resolvedFrameworkName}</h3>
              <p className="max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                {profile?.summary ?? 'Specialist guidance will appear here after the framework profile loads.'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge className="border-white/10 text-[color:var(--muted)]">{readinessScore}% ready</Badge>
            <ChevronDown className={cn('h-4 w-4 text-[color:var(--muted)] transition-transform', isOpen ? 'rotate-180' : 'rotate-0')} />
          </div>
        </button>

        <div className="flex flex-wrap gap-2">
          <Badge className="border-white/10 text-[color:var(--muted)]">{profile?.specialist_label ?? 'Specialist guidance'}</Badge>
          {compactList(profile?.best_for ?? []).map((item) => (
            <Badge key={item} className="border-white/10 bg-white/[0.04] text-[color:var(--text)]">
              {item}
            </Badge>
          ))}
        </div>

        {isLoading && !profile ? (
          <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4 text-sm text-[color:var(--muted)]">
            Loading framework specialist profile...
          </div>
        ) : null}

        {isOpen ? (
          <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="grid gap-4">
              <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Architecture guidance</p>
                    <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">Recommended shapes for this framework</p>
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
                        <span className="font-semibold text-[color:var(--text)]">Tradeoff:</span> {item.tradeoff}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Recommended capabilities</p>
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
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Readiness</p>
                  <div className="mt-3 space-y-3">
                    <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-3">
                      <p className="text-sm font-semibold text-[color:var(--text)]">{readiness?.label ?? profile?.readiness_profile.label}</p>
                      <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{readiness?.summary ?? profile?.readiness_profile.summary}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {compactList(readiness?.signals ?? profile?.readiness_profile.signals ?? [], 2).map((item) => (
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
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Pitfalls and tradeoffs</p>
                </div>
                <div className="mt-3 space-y-2">
                  {compactList(profile?.common_pitfalls ?? [], 3).map((item) => (
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
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Endpoint guidance</p>
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
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Testing and baseline</p>
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Testing</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {compactList(profile?.testing_strategy ?? [], 2).map((item) => (
                        <Badge key={item} className="border-white/10 bg-white/[0.04] text-[color:var(--text)]">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Security</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {compactList(profile?.security_baseline ?? [], 2).map((item) => (
                        <Badge key={item} className="border-white/10 bg-white/[0.04] text-[color:var(--text)]">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">Infrastructure</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {compactList(profile?.infrastructure_baseline ?? [], 3).map((item) => (
                        <Badge key={item} className="border-white/10 bg-white/[0.04] text-[color:var(--text)]">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Supported archetypes</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {compactList(profile?.supported_archetypes ?? [], 4).map((item) => (
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
