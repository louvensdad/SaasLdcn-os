'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Layers3, ShieldAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLocale } from '@/hooks/use-locale';
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

function compact(items: readonly string[], overflowLabel: string, limit = 3) {
  if (items.length <= limit) return items;
  return [...items.slice(0, limit), `+${items.length - limit} ${overflowLabel}`];
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
  const { t } = useLocale();
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
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[color:var(--muted)]">{t('infrastructure.title')}</p>
              <h3 className="mt-1 text-lg font-semibold text-[color:var(--text)]">{t('infrastructure.unavailable')}</h3>
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
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[color:var(--muted)]">{t('infrastructure.title')}</p>
                <Badge className="border-white/10 text-[color:var(--muted)]">
                  {t('infrastructure.requiredCount', { count: recommendation?.required.length ?? 0 })}
                </Badge>
              </div>
              <h3 className="text-xl font-semibold text-[color:var(--text)]">{t('infrastructure.foundationComponents')}</h3>
              <p className="max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                {t('infrastructure.description')}
              </p>
            </div>
          </div>
          <ChevronDown className={cn('h-4 w-4 text-[color:var(--muted)] transition-transform', isOpen ? 'rotate-180' : 'rotate-0')} />
        </button>

        {isLoading && !recommendation ? (
          <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4 text-sm text-[color:var(--muted)]">
            {t('infrastructure.loading')}
          </div>
        ) : null}

        {isOpen ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge className="border-white/10 text-[color:var(--muted)]">{t('infrastructure.selectedCount', { count: selectedComponentIds.length })}</Badge>
              <Badge className="border-white/10 text-[color:var(--muted)]">{t('infrastructure.recommendedCount', { count: recommendation?.recommended.length ?? 0 })}</Badge>
              <Badge className="border-white/10 text-[color:var(--muted)]">{t('infrastructure.optionalCount', { count: recommendation?.optional.length ?? 0 })}</Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={onSelectFoundation}>
                {t('infrastructure.selectFoundation')}
              </Button>
              <Button type="button" variant="soft" onClick={onClearSelection}>
                {t('infrastructure.clearSelection')}
              </Button>
            </div>

            {recommendation?.warnings.length ? (
              <div className="space-y-2 rounded-[var(--radius-xl)] border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="text-sm font-semibold text-[color:var(--text)]">{t('common.warnings')}</p>
                {compact(recommendation.warnings, t('common.more'), 3).map((warning) => (
                  <div key={warning} className="flex items-start gap-2 text-sm leading-6 text-[color:var(--muted)]">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {recommendation?.rationale.length ? (
              <div className="flex flex-wrap gap-2">
                {compact(recommendation.rationale, t('common.more'), 4).map((item) => (
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
                        {t(`infrastructure.category.${group.category}`)}
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
                                {isRequired ? <Badge className="border-white/10 text-[color:var(--text)]">{t('common.required')}</Badge> : null}
                                {isRecommended ? <Badge className="border-white/10 text-[color:var(--text)]">{t('common.recommended')}</Badge> : null}
                                {isOptional ? <Badge className="border-white/10 text-[color:var(--muted)]">{t('common.optional')}</Badge> : null}
                              </div>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">{component.summary}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {compact(component.best_for, t('common.more'), 2).map((item) => (
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
