'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

import { ActionLink } from '@/components/ui/action-link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/empty-states/empty-state';
import { PageError } from '@/components/feedback/error-system';
import { CardLoading } from '@/components/feedback/loading-system';
import { SectionHeader } from '@/components/shell/section-header';
import { DeploymentPathSurface, OperationalRail } from '@/components/visual/engineering-surface';
import { useTemplateCatalog } from '@/hooks/use-templates';
import { getApiErrorMessage } from '@/lib/api/errors';
import type { TemplateMarketplaceItem } from '@/lib/api/types';

function formatStatus(value: string) {
  return value.replaceAll('_', ' ');
}

function compatibilityLabel(template: TemplateMarketplaceItem) {
  if (template.maturity === 'mature' && template.complexity === 'low') return 'high compatibility';
  if (template.maturity === 'experimental') return 'review required';
  return 'compatible foundation';
}

export default function TemplatesPage() {
  const catalogQuery = useTemplateCatalog();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [complexity, setComplexity] = useState('all');
  const catalog = catalogQuery.data;

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (catalog?.templates ?? []).filter((template) => {
      const searchable = [
        template.name,
        template.description,
        template.category,
        ...template.tags,
        ...template.supported_frameworks,
        ...template.supported_archetypes,
      ].join(' ').toLowerCase();
      return (
        (!query || searchable.includes(query)) &&
        (category === 'all' || template.category === category) &&
        (complexity === 'all' || template.complexity === complexity)
      );
    });
  }, [catalog?.templates, category, complexity, search]);

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Templates"
        description="Local template marketplace foundation with deterministic metadata, compatibility signals, maturity, and changelog. No external marketplace or downloads."
      />

      {catalogQuery.isLoading ? (
        <div className="grid gap-4">
          <CardLoading />
          <CardLoading />
        </div>
      ) : catalogQuery.isError ? (
        <PageError
          title="Template catalog unavailable"
          description={getApiErrorMessage(catalogQuery.error, 'Unable to load the local template marketplace catalog.')}
          onRetry={() => void catalogQuery.refetch()}
        />
      ) : !catalog || catalog.templates.length === 0 ? (
        <EmptyState kind="templates" />
      ) : (
        <div className="space-y-5">
          <Card className="space-y-4 p-5">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" aria-hidden />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-9"
                  placeholder="Search by template, tag, framework, or archetype"
                  aria-label="Search templates"
                />
              </label>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="focus-ring rounded-full border border-[color:var(--border)] bg-white/5 px-4 py-2 text-sm text-[color:var(--text)]"
                aria-label="Filter templates by category"
              >
                <option value="all">All categories</option>
                {catalog.categories.map((item) => (
                  <option key={item} value={item}>{formatStatus(item)}</option>
                ))}
              </select>
              <select
                value={complexity}
                onChange={(event) => setComplexity(event.target.value)}
                className="focus-ring rounded-full border border-[color:var(--border)] bg-white/5 px-4 py-2 text-sm text-[color:var(--text)]"
                aria-label="Filter templates by complexity"
              >
                <option value="all">All complexity</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge>{filteredTemplates.length} templates</Badge>
              <Badge>Template compatibility validated</Badge>
              <Badge>Template maturity verified</Badge>
            </div>
          </Card>

          <DeploymentPathSurface
            title="Marketplace foundation"
            steps={[
              { label: 'Local registry', detail: `${catalog.templates.length} local manifest-backed templates indexed`, tone: 'accent' },
              { label: 'Metadata engine', detail: 'Version, category, complexity, maturity, previews, tags, and changelog attached', tone: 'accent2' },
              { label: 'Compatibility engine', detail: 'Wizard selections can score compatible templates without external calls', tone: 'success' },
            ]}
          />

          {filteredTemplates.length === 0 ? (
            <Card className="p-5">
              <p className="text-sm font-semibold text-[color:var(--text)]">No templates match these filters.</p>
              <Button type="button" variant="secondary" className="mt-4" onClick={() => { setSearch(''); setCategory('all'); setComplexity('all'); }}>
                Clear filters
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {filteredTemplates.map((template) => (
                <Card key={template.id} className="relative overflow-hidden p-5">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_34%)]" />
                  <div className="relative space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{formatStatus(template.category)}</p>
                        <h3 className="mt-2 text-2xl font-semibold text-[color:var(--text)]">{template.name}</h3>
                        <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{template.description}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge>v{template.version}</Badge>
                        <Badge>{formatStatus(template.maturity)}</Badge>
                      </div>
                    </div>

                    <OperationalRail
                      title="Compatibility"
                      items={[
                        { label: 'Signal', value: compatibilityLabel(template), detail: 'Deterministic local compatibility metadata', tone: 'success' },
                        { label: 'Complexity', value: template.complexity, detail: 'Implementation surface', tone: template.complexity === 'low' ? 'success' : template.complexity === 'medium' ? 'warning' : 'danger' },
                        { label: 'Frameworks', value: template.supported_frameworks.join(', '), detail: 'Supported framework IDs', tone: 'accent' },
                        { label: 'Archetypes', value: template.supported_archetypes.join(', '), detail: 'Compatible archetype IDs', tone: 'accent2' },
                      ]}
                    />

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
                        <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted)]">Capabilities</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {template.capabilities.map((item) => <Badge key={item}>{item}</Badge>)}
                        </div>
                      </div>
                      <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
                        <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted)]">Latest changelog</p>
                        <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
                          {template.changelog[0]?.changes.join(' ') ?? 'No changelog entry.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {template.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
                    </div>

                    <ActionLink href="/wizard" variant="primary" className="w-fit">
                      Use in wizard
                    </ActionLink>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
