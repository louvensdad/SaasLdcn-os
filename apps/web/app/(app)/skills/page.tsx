'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, ShieldCheck } from 'lucide-react';

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
import type { SkillDefinition } from '@/lib/api/types';
import { useLDCNStore } from '@/stores/use-ldcn-store';

function formatLabel(value: string) {
  return value.replaceAll('_', ' ');
}

export default function SkillsPage() {
  const skillsQuery = useSkills();
  const previewMutation = useSkillPreview();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const setPresenceState = useLDCNStore((state) => state.setPresenceState);
  const setContext = useLDCNStore((state) => state.setContext);

  const skills = skillsQuery.data?.skills ?? [];
  const selectedSkill = skills.find((skill) => skill.id === selectedSkillId) ?? skills[0] ?? null;

  const filteredSkills = useMemo(() => {
    const query = search.trim().toLowerCase();
    return skills.filter((skill) => {
      const searchable = [skill.name, skill.description, skill.category, ...skill.tags, ...skill.examples].join(' ').toLowerCase();
      return (!query || searchable.includes(query)) && (category === 'all' || skill.category === category);
    });
  }, [category, search, skills]);

  useEffect(() => {
    setPresenceState('observing');
    setContext({
      route: '/skills',
      page_title: 'Skill Registry',
      current_phase: 'Skill registry foundation',
      pipeline: {
        route: '/skills',
        phase: 'Skill registry foundation',
        status: skillsQuery.isError ? 'degraded' : 'ready',
        readiness_label: skillsQuery.data ? `${skills.length} skills synchronized` : 'Skill registry loading',
        detail: 'Read-only operational skills are indexed without agents, AI, or external integrations.',
      },
      status: skillsQuery.isError ? 'warning' : 'observing',
      summary: 'Skill registry synchronized. Architecture review skill available. Generation skill unlocked when project context exists.',
      suggestions: [],
    });
  }, [setContext, setPresenceState, skills.length, skillsQuery.data, skillsQuery.isError]);

  function previewSkill(skill: SkillDefinition) {
    previewMutation.mutate({ skill_id: skill.id, context: { surface: 'skills_page' } });
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Skills"
        description="Official read-only registry of operational skills LDCN OS can assist with. Skills are not capabilities, templates, frameworks or agents."
      />

      {skillsQuery.isLoading ? (
        <CardLoading />
      ) : skillsQuery.isError ? (
        <PageError
          title="Skill registry unavailable"
          description={getApiErrorMessage(skillsQuery.error, 'Unable to load the local skill registry.')}
          onRetry={() => void skillsQuery.refetch()}
        />
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
                    placeholder="Search skills by action, tag or example"
                    aria-label="Search skills"
                  />
                </label>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="focus-ring rounded-full border border-[color:var(--border)] bg-white/5 px-4 py-2 text-sm text-[color:var(--text)]"
                  aria-label="Filter skills by category"
                >
                  <option value="all">All categories</option>
                  {skillsQuery.data?.categories.map((item) => (
                    <option key={item} value={item}>{formatLabel(item)}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>{filteredSkills.length} skills</Badge>
                <Badge>Skill registry synchronized</Badge>
                <Badge>Architecture review skill available</Badge>
                <Badge>Generation skill unlocked</Badge>
              </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              {filteredSkills.map((skill) => (
                <Card key={skill.id} className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{formatLabel(skill.category)}</p>
                      <h2 className="mt-2 text-xl font-semibold text-[color:var(--text)]">{skill.name}</h2>
                    </div>
                    <Badge>{formatLabel(skill.metadata.execution_mode)}</Badge>
                  </div>
                  <p className="text-sm leading-6 text-[color:var(--muted)]">{skill.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {skill.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
                  </div>
                  <Button type="button" variant="secondary" onClick={() => setSelectedSkillId(skill.id)}>
                    View skill details
                  </Button>
                </Card>
              ))}
            </div>
          </div>

          <Card className="h-fit space-y-5 p-5 xl:sticky xl:top-24" data-testid="skill-detail-panel">
            {selectedSkill ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Skill details</p>
                    <h2 className="mt-2 text-2xl font-semibold text-[color:var(--text)]">{selectedSkill.name}</h2>
                  </div>
                  <ShieldCheck className="h-5 w-5 text-[color:var(--accent)]" aria-hidden />
                </div>

                <OperationalRail
                  title="Governance"
                  items={[
                    { label: 'Safe', value: selectedSkill.metadata.safe ? 'yes' : 'no', detail: 'No direct executor is attached.', tone: 'success' },
                    { label: 'AI', value: selectedSkill.metadata.no_ai ? 'blocked' : 'enabled', detail: 'No AI path in this registry.', tone: 'success' },
                    { label: 'Agents', value: selectedSkill.metadata.no_agents ? 'blocked' : 'enabled', detail: 'No agent runtime is connected.', tone: 'success' },
                    { label: 'External', value: selectedSkill.metadata.no_external_integrations ? 'blocked' : 'enabled', detail: 'Local-only registry.', tone: 'success' },
                  ]}
                />

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-[color:var(--text)]">Dependencies</p>
                  {selectedSkill.dependencies.map((dependency) => (
                    <div key={dependency.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                      <p className="text-sm font-semibold text-[color:var(--text)]">{dependency.label}</p>
                      <p className="mt-1 text-xs text-[color:var(--muted)]">{dependency.kind} / {dependency.required ? 'required' : 'optional'}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-[color:var(--text)]">Requirements</p>
                  {selectedSkill.requirements.map((item) => <p key={item} className="text-sm text-[color:var(--muted)]">{item}</p>)}
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-[color:var(--text)]">Examples</p>
                  {selectedSkill.examples.map((item) => <p key={item} className="text-sm text-[color:var(--muted)]">{item}</p>)}
                </div>

                <Button type="button" variant="primary" onClick={() => previewSkill(selectedSkill)} disabled={previewMutation.isPending}>
                  {previewMutation.isPending ? 'Previewing skill' : 'Preview safe plan'}
                </Button>

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
              <p className="text-sm text-[color:var(--muted)]">Select a skill to inspect dependencies and examples.</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
