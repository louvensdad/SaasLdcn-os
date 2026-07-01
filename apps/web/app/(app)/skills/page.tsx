'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, SearchX, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageError } from '@/components/feedback/error-system';
import { CardLoading } from '@/components/feedback/loading-system';
import { SectionHeader } from '@/components/shell/section-header';
import { OperationalRail } from '@/components/visual/engineering-surface';
import { useSkillPreview, useSkills } from '@/hooks/use-skills';
import { getApiErrorMessage } from '@/lib/api/errors';
import { cn } from '@/lib/cn';
import type { SkillDefinition } from '@/lib/api/types';
import { useLDCNStore } from '@/stores/use-ldcn-store';
import { useLocale } from '@/hooks/use-locale';

function formatLabel(value: string) {
  return value.replaceAll('_', ' ');
}

export default function SkillsPage() {
  const { t } = useLocale();
  const skillsQuery = useSkills();
  const previewMutation = useSkillPreview();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const setPresenceState = useLDCNStore((state) => state.setPresenceState);
  const setContext = useLDCNStore((state) => state.setContext);

  const skills = skillsQuery.data?.skills ?? [];

  const filteredSkills = useMemo(() => {
    const query = search.trim().toLowerCase();
    return skills.filter((skill) => {
      const searchable = [
        skill.name,
        skill.description,
        skill.category,
        ...(skill.tags ?? []),
        ...(skill.examples ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return (!query || searchable.includes(query)) && (category === 'all' || skill.category === category);
    });
  }, [category, search, skills]);

  // Keep an explicitly chosen skill in the detail panel even if it is filtered
  // out of the grid; otherwise default to the first visible (then any) skill.
  const selectedSkill = useMemo(() => {
    if (selectedSkillId) {
      const chosen = skills.find((skill) => skill.id === selectedSkillId);
      if (chosen) return chosen;
    }
    return filteredSkills[0] ?? skills[0] ?? null;
  }, [filteredSkills, selectedSkillId, skills]);

  const hasActiveFilters = search.trim() !== '' || category !== 'all';

  function clearFilters() {
    setSearch('');
    setCategory('all');
  }

  useEffect(() => {
    setPresenceState('observing');
    setContext({
      route: '/skills',
      page_title: t('skills.context.pageTitle'),
      current_phase: t('skills.context.phase'),
      pipeline: {
        route: '/skills',
        phase: t('skills.context.phase'),
        status: skillsQuery.isError ? 'degraded' : 'ready',
        readiness_label: skillsQuery.data ? t('skills.context.synchronized', { count: skills.length }) : t('skills.context.loading'),
        detail: t('skills.context.detail'),
      },
      status: skillsQuery.isError ? 'warning' : 'observing',
      summary: t('skills.context.summary'),
      suggestions: [],
    });
  }, [setContext, setPresenceState, skills.length, skillsQuery.data, skillsQuery.isError, t]);

  function previewSkill(skill: SkillDefinition) {
    previewMutation.mutate({ skill_id: skill.id, context: { surface: 'skills_page' } });
  }

  function selectSkill(skill: SkillDefinition) {
    setSelectedSkillId(skill.id);
    previewMutation.reset();
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        title={t('skills.title')}
        description={t('skills.description')}
      />

      {skillsQuery.isLoading ? (
        <CardLoading />
      ) : skillsQuery.isError ? (
        <PageError
          title={t('skills.error.title')}
          description={getApiErrorMessage(skillsQuery.error, t('skills.error.description'))}
          onRetry={() => void skillsQuery.refetch()}
        />
      ) : skills.length === 0 ? (
        <Card className="space-y-3 p-10 text-center">
          <SearchX className="mx-auto h-8 w-8 text-[color:var(--muted)]" aria-hidden />
          <h2 className="text-lg font-semibold text-[color:var(--text)]">{t('skills.empty.title')}</h2>
          <p className="mx-auto max-w-md text-sm leading-6 text-[color:var(--muted)]">{t('skills.empty.description')}</p>
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
          <div className="space-y-5">
            <Card className="space-y-4 p-5">
              <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                <label className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" aria-hidden />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="pl-9"
                    placeholder={t('skills.search')}
                    aria-label={t('skills.search')}
                  />
                </label>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="focus-ring rounded-full border border-[color:var(--border)] bg-[color:var(--control-bg)] px-4 py-2 text-sm text-[color:var(--text)]"
                  aria-label={t('skills.filter')}
                >
                  <option value="all">{t('skills.allCategories')}</option>
                  {skillsQuery.data?.categories.map((item) => (
                    <option key={item} value={item}>{formatLabel(item)}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{t('skills.count', { count: filteredSkills.length })}</Badge>
                <Badge>{t('skills.outcomeFocused')}</Badge>
                <Badge>{t('skills.safe')}</Badge>
                {hasActiveFilters ? (
                  <Button type="button" variant="ghost" className="ml-auto" onClick={clearFilters}>
                    {t('skills.clearFilters')}
                  </Button>
                ) : null}
              </div>
            </Card>

            {filteredSkills.length === 0 ? (
              <Card className="space-y-3 p-10 text-center">
                <SearchX className="mx-auto h-8 w-8 text-[color:var(--muted)]" aria-hidden />
                <h2 className="text-lg font-semibold text-[color:var(--text)]">{t('skills.noResults.title')}</h2>
                <p className="mx-auto max-w-md text-sm leading-6 text-[color:var(--muted)]">{t('skills.noResults.description')}</p>
                <div>
                  <Button type="button" variant="secondary" onClick={clearFilters}>
                    {t('skills.clearFilters')}
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {filteredSkills.map((skill) => {
                  const isSelected = selectedSkill?.id === skill.id;
                  return (
                    <Card
                      key={skill.id}
                      onClick={() => selectSkill(skill)}
                      className={cn(
                        'group cursor-pointer space-y-4 p-5 transition focus-within:ring-1 focus-within:ring-[color:var(--accent)] hover:border-[color:var(--accent)]',
                        isSelected && 'border-[color:var(--accent)] ring-1 ring-[color:var(--accent)]',
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{formatLabel(skill.category)}</p>
                          <h2 className="mt-2 text-xl font-semibold text-[color:var(--text)]">{t(`skills.item.${skill.id}`)}</h2>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge>{formatLabel(skill.metadata.execution_mode)}</Badge>
                          {isSelected ? <Badge className="border-[color:var(--accent)] text-[color:var(--accent)]">{t('skills.selected')}</Badge> : null}
                        </div>
                      </div>
                      <p className="text-sm leading-6 text-[color:var(--muted)]">{t(`skills.item.${skill.id}.description`)}</p>
                      <div className="flex flex-wrap gap-2">
                        {(skill.tags ?? []).map((tag) => <Badge key={tag}>{tag}</Badge>)}
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        aria-label={t('skills.viewDetails')}
                        onClick={(event) => {
                          event.stopPropagation();
                          selectSkill(skill);
                        }}
                      >
                        {t('skills.viewDetails')}
                      </Button>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          <Card className="h-fit space-y-5 p-5 xl:sticky xl:top-24" data-testid="skill-detail-panel">
            {selectedSkill ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{t('skills.details')}</p>
                    <h2 className="mt-2 text-2xl font-semibold text-[color:var(--text)]">{t(`skills.item.${selectedSkill.id}`)}</h2>
                  </div>
                  <ShieldCheck className="h-5 w-5 text-[color:var(--accent)]" aria-hidden />
                </div>

                <OperationalRail
                  title={t('skills.trust')}
                  items={[
                    { label: t('skills.trust.safe'), value: selectedSkill.metadata.safe ? t('common.yes') : t('common.no'), detail: t('skills.trust.safeDetail'), tone: 'success' },
                    { label: t('skills.trust.ai'), value: selectedSkill.metadata.no_ai ? t('common.blocked') : t('common.enabled'), detail: t('skills.trust.aiDetail'), tone: 'success' },
                    { label: t('skills.trust.agents'), value: selectedSkill.metadata.no_agents ? t('common.blocked') : t('common.enabled'), detail: t('skills.trust.agentsDetail'), tone: 'success' },
                    { label: t('skills.trust.external'), value: selectedSkill.metadata.no_external_integrations ? t('common.blocked') : t('common.enabled'), detail: t('skills.trust.externalDetail'), tone: 'success' },
                  ]}
                />

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-[color:var(--text)]">{t('skills.dependencies')}</p>
                  {(selectedSkill.dependencies ?? []).map((dependency) => (
                    <div key={dependency.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                      <p className="text-sm font-semibold text-[color:var(--text)]">{dependency.label}</p>
                      <p className="mt-1 text-xs text-[color:var(--muted)]">{dependency.kind} / {dependency.required ? t('common.required') : t('common.optional')}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-[color:var(--text)]">{t('skills.requirements')}</p>
                  {(selectedSkill.requirements ?? []).map((item) => <p key={item} className="text-sm text-[color:var(--muted)]">{item}</p>)}
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-[color:var(--text)]">{t('skills.examples')}</p>
                  {(selectedSkill.examples ?? []).map((item) => <p key={item} className="text-sm text-[color:var(--muted)]">{item}</p>)}
                </div>

                <Button type="button" variant="primary" onClick={() => previewSkill(selectedSkill)} disabled={previewMutation.isPending}>
                  {previewMutation.isPending ? t('skills.previewing') : t('skills.preview')}
                </Button>

                {previewMutation.isError ? (
                  <p className="text-sm text-[color:var(--danger,#f87171)]" role="alert">
                    {getApiErrorMessage(previewMutation.error, t('skills.previewError'))}
                  </p>
                ) : null}

                {previewMutation.data ? (
                  <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                    <p className="text-sm font-semibold text-[color:var(--text)]">{previewMutation.data.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{previewMutation.data.summary}</p>
                    <div className="mt-3 grid gap-2">
                      {previewMutation.data.steps.map((step) => <p key={step} className="text-xs text-[color:var(--muted)]">{step}</p>)}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-[color:var(--muted)]">{t('skills.select')}</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
