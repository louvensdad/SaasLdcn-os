'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Layers3, ShieldAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import type { InfrastructureComponent, InfrastructureRecommendation } from '@/lib/api/types';

interface GroupedInfrastructureCategory {
  readonly category: string;
  readonly components: readonly InfrastructureComponent[];
}

interface InfrastructureRecommendationsPanelProps {
  readonly groupedComponents: readonly GroupedInfrastructureCategory[];
  readonly recommendation: InfrastructureRecommendation | null;
  readonly selectedComponentIds: readonly string[];
  readonly isLoading: boolean;
  readonly errorMessage?: string | null;
  readonly onToggleComponent: (componentId: string) => void;
  readonly onSelectFoundation: () => void;
  readonly onClearSelection: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  database: 'Database',
  cache: 'Cache',
  queue: 'Queue',
  object_storage: 'Object Storage',
  auth_provider: 'Auth Provider',
  observability: 'Observability',
  deployment: 'Deployment',
  containerization: 'Containerization',
  api_gateway: 'API Gateway',
  search: 'Search',
  vector_database: 'Vector Database',
  email_provider: 'Email Provider',
  payment_provider: 'Payment Provider',
};

function compact(items: readonly string[], limit = 3) {
  if (items.length <= limit) return items;
  return [...items.slice(0, limit), `+${items.length - limit} more`];
}

export function InfrastructureRecommendationsPanel({
  groupedComponents,
  recommendation,
  selectedComponentIds,
  isLoading,
  errorMessage,
  onToggleComponent,
  onSelectFoundation,
  onClearSelection,
}: InfrastructureRecommendationsPanelProps) {
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    setIsOpen(Boolean(recommendation));
  }, [recommendation]);

  if (errorMessage) {
    return (
      <Card className="relative overflow-hidden border border-white/10 bg-white/[0.04] p-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_12%,transparent),transparent_40%)]" />
        <div className="relative space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-xl)] border border-rose-500/30 bg-rose-500/10 text-rose-200">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[color:var(--muted)]">Infrastructure recommendations</p>
              <h3 className="mt-1 text-lg font-semibold text-[color:var(--text)]">Infrastructure registry unavailable</h3>
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
    <Card className="relative overflow-hidden border border-white/10 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent)_8%,transparent),color-mix(in_srgb,var(--surface)_90%,black_10%))] p-5 shadow-[var(--shadow-cinematic)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_15%,transparent),transparent_36%)]" />
      <div className="relative space-y-4">
        <button
          type="button"
          className="flex w-full items-start justify-between gap-4 text-left"
          onClick={() => setIsOpen((current) => !current)}
        >
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.05] text-[color:var(--text)]">
              <Layers3 className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[color:var(--muted)]">Infrastructure recommendations</p>
                <Badge className="border-white/10 text-[color:var(--muted)]">
                  {recommendation?.required.length ?? 0} required
                </Badge>
              </div>
              <h3 className="text-xl font-semibold text-[color:var(--text)]">Foundation components</h3>
              <p className="max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                Select only the infrastructure foundation you want to keep in the blueprint preview. No generation is performed here.
              </p>
            </div>
          </div>
          <ChevronDown className={cn('h-4 w-4 text-[color:var(--muted)] transition-transform', isOpen ? 'rotate-180' : 'rotate-0')} />
        </button>

        {isLoading && !recommendation ? (
          <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4 text-sm text-[color:var(--muted)]">
            Loading infrastructure recommendations...
          </div>
        ) : null}

        {isOpen ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge className="border-white/10 text-[color:var(--muted)]">Selected {selectedComponentIds.length}</Badge>
              <Badge className="border-white/10 text-[color:var(--muted)]">Recommended {recommendation?.recommended.length ?? 0}</Badge>
              <Badge className="border-white/10 text-[color:var(--muted)]">Optional {recommendation?.optional.length ?? 0}</Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={onSelectFoundation}>
                Select foundation only
              </Button>
              <Button type="button" variant="soft" onClick={onClearSelection}>
                Clear infra selection
              </Button>
            </div>

            {recommendation?.warnings.length ? (
              <div className="space-y-2 rounded-[var(--radius-xl)] border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="text-sm font-semibold text-[color:var(--text)]">Warnings</p>
                {compact(recommendation.warnings, 3).map((warning) => (
                  <div key={warning} className="flex items-start gap-2 text-sm leading-6 text-[color:var(--muted)]">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {recommendation?.rationale.length ? (
              <div className="flex flex-wrap gap-2">
                {compact(recommendation.rationale, 4).map((item) => (
                  <Badge key={item} className="border-white/10 bg-white/[0.04] text-[color:var(--text)]">
                    {item}
                  </Badge>
                ))}
              </div>
            ) : null}

            <div className="grid gap-4">
              {groupedComponents.map((group) => {
                const visibleComponents = group.components.filter((component) => {
                  const bucket = new Set([
                    ...(recommendation?.required ?? []),
                    ...(recommendation?.recommended ?? []),
                    ...(recommendation?.optional ?? []),
                    ...selectedComponentIds,
                  ]);
                  return bucket.has(component.id);
                });

                if (!visibleComponents.length) {
                  return null;
                }

                return (
                  <div key={group.category} className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[color:var(--text)]">
                        {CATEGORY_LABELS[group.category] ?? group.category}
                      </p>
                      <Badge className="border-white/10 text-[color:var(--muted)]">{visibleComponents.length}</Badge>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {visibleComponents.map((component) => {
                        const isSelected = selectedComponentIds.includes(component.id);
                        const isRequired = recommendation?.required.includes(component.id) ?? false;
                        const isRecommended = recommendation?.recommended.includes(component.id) ?? false;
                        const isOptional = recommendation?.optional.includes(component.id) ?? false;

                        return (
                          <button
                            key={component.id}
                            type="button"
                            onClick={() => onToggleComponent(component.id)}
                            className={cn(
                              'rounded-[var(--radius-xl)] border p-3 text-left transition',
                              isSelected
                                ? 'border-[color-mix(in_srgb,var(--accent)_38%,transparent)] bg-white/[0.08]'
                                : 'border-white/10 bg-black/10 hover:border-white/20',
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-[color:var(--text)]">{component.name}</p>
                              <div className="flex flex-wrap gap-1">
                                {isRequired ? <Badge className="border-white/10 text-[color:var(--text)]">Required</Badge> : null}
                                {isRecommended ? <Badge className="border-white/10 text-[color:var(--text)]">Recommended</Badge> : null}
                                {isOptional ? <Badge className="border-white/10 text-[color:var(--muted)]">Optional</Badge> : null}
                              </div>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">{component.summary}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {compact(component.best_for, 2).map((item) => (
                                <Badge key={item} className="border-white/10 bg-white/[0.04] text-[color:var(--muted)]">
                                  {item}
                                </Badge>
                              ))}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
